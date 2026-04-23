import type { Schemas } from "./generated";

// typed-openapi omits the `Schemas.` prefix when referencing
// underscore-prefixed schema types from query-parameter positions inside
// the Endpoints namespace. Re-declare them as members of Endpoints so the
// unqualified references in `generated.ts` resolve via declaration merging.
declare module "./generated" {
  namespace Endpoints {
    type _DateRange = Schemas._DateRange;
    type _LogPropertyFilter = Schemas._LogPropertyFilter;
  }
}
