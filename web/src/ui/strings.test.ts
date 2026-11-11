// SPDX-License-Identifier: GPL-3.0-only
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { s } from './strings';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.includes('.test.') && entry.name !== 'strings.ts' ? [path] : [];
  });
}

const COPY_ATTRIBUTES = new Set(['aria-label', 'title', 'placeholder', 'label']);
const COPY_PROPERTIES = new Set(['aria-label', 'label', 'title', 'hint']);

/** Only expression positions that produce text; conditions and nested elements are not copy. */
function renderedLiterals(expression: ts.Expression): ts.Expression[] {
  if (ts.isStringLiteral(expression) || ts.isTemplateExpression(expression)) return [expression];
  if (ts.isParenthesizedExpression(expression)) return renderedLiterals(expression.expression);
  if (ts.isConditionalExpression(expression)) {
    return [...renderedLiterals(expression.whenTrue), ...renderedLiterals(expression.whenFalse)];
  }
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    return renderedLiterals(expression.right);
  }
  return [];
}

function literalText(expression: ts.Expression): string {
  if (ts.isStringLiteral(expression)) return expression.text;
  return ts.isTemplateExpression(expression) ? expression.head.text : '';
}

function auditCopyAttribute(path: string, source: ts.SourceFile, node: ts.Node, violations: string[]): void {
  if (!ts.isJsxAttribute(node) || !COPY_ATTRIBUTES.has(node.name.getText(source))) return;
  if (node.initializer && ts.isStringLiteral(node.initializer) && /[A-Za-z]/.test(node.initializer.text)) {
    violations.push(`${path}: ${node.name.getText(source)}=${JSON.stringify(node.initializer.text)}`);
  }
  if (node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression && ts.isTemplateExpression(node.initializer.expression)) {
    violations.push(`${path}: ${node.name.getText(source)} uses an uncatalogued template`);
  }
}

function auditCopyProperty(path: string, source: ts.SourceFile, node: ts.Node, violations: string[]): void {
  if (!ts.isPropertyAssignment(node) || !COPY_PROPERTIES.has(node.name.getText(source).replace(/^['"]|['"]$/g, ''))) return;
  if ((ts.isStringLiteral(node.initializer) || ts.isTemplateExpression(node.initializer)) && /[A-Za-z]/.test(literalText(node.initializer))) {
    violations.push(`${path}: ${node.name.getText(source)} uses an uncatalogued literal`);
  }
}

function auditRenderedExpression(path: string, source: ts.SourceFile, node: ts.Node, violations: string[]): void {
  if (!ts.isJsxExpression(node) || !node.expression || (!ts.isJsxElement(node.parent) && !ts.isJsxFragment(node.parent))) return;
  for (const literal of renderedLiterals(node.expression)) {
    if (/[A-Za-z]/.test(literalText(literal))) violations.push(`${path}: rendered expression uses ${JSON.stringify(literal.getText(source))}`);
  }
}

function auditNode(path: string, source: ts.SourceFile, node: ts.Node, violations: string[]): void {
  if (ts.isJsxText(node)) {
    const value = node.getText(source).trim();
    if (/[A-Za-z]/.test(value)) violations.push(`${path}: text ${JSON.stringify(value)}`);
  }
  auditCopyAttribute(path, source, node, violations);
  auditCopyProperty(path, source, node, violations);
  auditRenderedExpression(path, source, node, violations);
}

describe('N10 typed English catalog', () => {
  it('interpolates named placeholders without changing the English text', () => {
    expect(s('Play from step {n}', { n: 3 })).toBe('Play from step 3');
    expect(s('Mini-map navigation')).toBe('Mini-map navigation');
    expect(s('Play from step {n}', { other: 3 })).toBe('Play from step {n}');
  });

  it('keeps rendered copy, accessible names and copy fields in strings.ts', () => {
    const violations: string[] = [];
    for (const path of sourceFiles(join('web', 'src', 'ui'))) {
      const source = ts.createSourceFile(
        path,
        readFileSync(path, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      const visit = (node: ts.Node): void => {
        auditNode(path, source, node, violations);
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(violations).toEqual([]);
  });
});
