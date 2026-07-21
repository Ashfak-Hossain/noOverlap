# 0014. Tailwind and React Router for the web client

Status: Accepted

## Context

React and a server-state cache were already fixed for the client, but styling, routing, and the date
picker were not. A design system arrived separately — colours, type scale, spacing, radii and shadows,
with a light and a dark palette authored independently of each other — so the styling question was
really about how cleanly those tokens could become code.

Routing mattered more than it usually does. Search criteria — where, when, how many guests — belong in
the URL so a set of results can be shared and survives a refresh, which makes the router part of the
application's behaviour rather than a detail of navigation.

## Decision

Style with Tailwind. Its current major is configured in CSS rather than JavaScript, so the design
tokens are declared once as custom properties and the framework consumes them directly; the same
definitions serve both utility classes and any hand-written CSS.

Route with React Router, the option the wider ecosystem has settled on, which keeps answers plentiful
and the knowledge portable.

Pick dates with react-day-picker, and handle date arithmetic and formatting with date-fns.

## Consequences

Tokens live in one file and components refer to them rather than to raw values, so changing the look
is an edit in one place instead of a search across the tree. Both themes are written out explicitly,
neither derived from the other by inversion.

Markup carries utility classes, which is the acknowledged cost: styling sits next to structure, and
class lists get long. Recurring patterns become components rather than aliased class bundles, keeping
the component the unit of reuse.

Two details proved load-bearing during implementation and are worth knowing before adding to this
codebase. The token mapping must be declared so that generated utilities *reference* the custom
properties rather than resolve them at build time — otherwise every utility is compiled against the
light palette and switching theme at runtime silently does nothing. And third-party widgets ship their
own palettes: the date picker hard-codes colours that are unreadable on a dark surface, so its styling
is remapped onto these tokens rather than trusted.

## Alternatives considered

Plain CSS modules with custom properties need no framework and teach nothing but the platform. They
also leave every spacing and layout convention to be invented and then maintained by hand.

A typed CSS-in-TypeScript approach would make a mistyped token fail the build instead of rendering
nothing. It has the smallest ecosystem of the three, and that safety is a smaller prize once tokens
are already centralised in one file.

A fully type-safe router would suit URL-driven search well. It was set aside to avoid learning a
second, far less common routing model alongside everything else here, and because router typing is not
where this project's difficulty lives.

## Trade-off

Tailwind is a real dependency whose classes are visible in every component. In return the design
system maps almost directly onto it, theming costs one declaration, and there is no bespoke CSS
architecture to maintain. React Router is chosen for ubiquity over stronger typing — weaker guarantees
about route parameters, in exchange for being the tool most readers already know.
