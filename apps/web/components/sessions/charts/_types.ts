/**
 * Shared typing helpers for the Recharts-based chart components.
 *
 * Recharts exports `TooltipContentProps<TValue, TName>` for the `content` prop
 * of `<Tooltip />`, plus `TooltipPayloadEntry` for each row inside `payload`.
 * Importing those generics directly eliminates the `any`-typed
 * custom-tooltip pattern and keeps the component props narrow while still
 * matching Recharts' internal shape.
 *
 * Note: when a tooltip content component is passed as JSX (`<Tooltip
 * content={<Custom />} />`), Recharts clones the element at runtime and
 * injects `active`/`payload`/`coordinate`/etc. Every prop is therefore
 * optional at authoring time — hence the `Partial<…>` wrapper.
 */

import type { TooltipContentProps, TooltipPayloadEntry } from "recharts";

/**
 * Props for a custom `content` renderer passed to Recharts `<Tooltip />`.
 *
 * `TValue` = the shape of `payload[i].value`. For our numeric charts it is
 * `number`; string/array value types are rare here but allowed by the generic.
 * `TName` = the shape of `payload[i].name` (typically `string`).
 */
export type ChartTooltipProps<
  TValue extends number | string = number,
  TName extends string | number = string,
> = Partial<TooltipContentProps<TValue, TName>>;

export type { TooltipPayloadEntry };
