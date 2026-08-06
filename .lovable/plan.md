# Add pointer cursor to auth toggle button

## Goal
Make the "Sign in" / "Create an account" toggle button in `/src/routes/auth.tsx` show a pointer cursor on hover.

## Change
Add the Tailwind `cursor-pointer` class to the `<button>` at line 286 that toggles between sign-in and sign-up modes.

Current classes:
```text
className="text-primary underline-offset-4 hover:underline"
```

Updated classes:
```text
className="cursor-pointer text-primary underline-offset-4 hover:underline"
```

## Verification
- Open `/auth` in the preview.
- Hover over the "Sign in" / "Create an account" text link.
- Confirm the mouse cursor changes to a pointer.
