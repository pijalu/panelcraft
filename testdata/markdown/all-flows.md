# Flows

## Café walkthrough ⚡

_How an order reaches the shop_

1. **Intro** — Welcome
   (dwell 800 ms)
2. **Message** — Ada `a` → Wéb · Shop `b`: order
   _the order leaves the shopper_
   (camera hold)
3. **Process** — API "core" `c`: settles
   (camera focus (420, 180) zoom 1.5)
4. **Message** — Ada `a` → API "core" `c`: fallback
5. **Alternative** "express?"
   - **Branch "yes"**
      1. **Message** — Ada `a` → API "core" `c`: rush
   - **Branch "no"**
      1. **Message** — Wéb · Shop `b` → API "core" `c`, flipped
6. **Parallel** "fan out"
   - **Lane 1**
      1. **Message** — Ada `a` → Wéb · Shop `b`: notify, flipped
   - **Lane 2**
      1. **Info** — by the way
7. **Info** — mild note
8. **Go to** — other.pcd#refund (returns here)
   (camera auto; transition 120 ms)
9. **Conclusion** — Done

## Refunds

1. **Conclusion** — Nothing to do
