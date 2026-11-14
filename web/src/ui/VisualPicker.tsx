// SPDX-License-Identifier: GPL-3.0-only
// CX-04: visual option picker. The tiles are decorative previews in front of a
// real radio group, so keyboard arrow navigation, roving focus and the
// accessible name/checked state stay native; the selected tile is marked by a
// check badge and weight, not by colour alone.
import type { ComponentChildren } from 'preact';

export interface VisualOption {
  value: string;
  label: string;
  preview: ComponentChildren;
}

export interface VisualPickerProps {
  /** Test id of the group; each option is `${id}-${value}`. */
  id: string;
  label: string;
  value: string;
  options: readonly VisualOption[];
  onChange: (value: string) => void;
}

export function VisualPicker(props: VisualPickerProps) {
  return (
    <fieldset class="field visual-field" data-testid={props.id}>
      <legend class="field-label">{props.label}</legend>
      <div class="visual-options">
        {props.options.map((option) => (
          <label
            key={option.value}
            class="visual-option"
            data-testid={`${props.id}-${option.value}`}
            title={option.label}
          >
            <input
              type="radio"
              name={props.id}
              value={option.value}
              checked={option.value === props.value}
              onChange={() => props.onChange(option.value)}
            />
            <span class="visual-option-preview" aria-hidden="true">
              {option.preview}
            </span>
            <span class="visual-option-name">{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
