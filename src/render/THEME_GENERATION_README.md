# Theme Generation

Use this process when deriving terminal themes from an external syntax theme.

## Process

1. Start from a source syntax theme.

   Prefer a syntax-highlighting theme (for example a `highlight.js` CSS theme),
   not an HTML markdown theme.

2. Extract the source palette exhaustively.

   Identify every distinct color and every semantically important token group in
   the source theme before making any mappings.

3. Enumerate only the target settings you actually intend to control.

   Decide the scope up front. For color theming, this usually means:
   - `cli-highlight` token styles
   - `marked-terminal` text/style hooks
   - any nested or delegated style options that affect visible styled output

4. Map source colors to target slots.

   Prefer direct mappings, collapse equivalent roles where sensible, and
   document any fallback choices.

   The two target layers are not equally direct:
   - `cli-highlight` is usually close to a 1:1 mapping from source token roles
   - `marked-terminal` is usually a palette-driven adaptation, because markdown
     roles (for example headings, blockquotes, links) do not have exact syntax
     theme equivalents

   In practice, treat the syntax theme as the source of truth for code tokens,
   and as color inspiration for markdown styling.

5. Put the final theme into a theme-specific TypeScript module.

   Export the `cli-highlight` options and the `marked-terminal` options from the
   same module, both derived from the same shared palette constants.

6. Keep intermediate artifacts optional.

   Use notes or scratch files only if needed to ensure completeness. They are a
   working aid, not the required output.

## Principle

Be exhaustive in analysis, but selective in what you formalize.

Only enumerate the full option surface when the task requires it. Otherwise,
define the intended theming scope first and map only the parts you mean to set.
