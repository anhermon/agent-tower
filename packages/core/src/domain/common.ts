export type Id = string;
export type IsoDateTime = string;
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export interface JsonObject {
  readonly [key: string]: JsonValue;
}
export type JsonArray = readonly JsonValue[];

export interface LabeledValue {
  readonly label: string;
  readonly value: string;
}

export interface PageRequest {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface Page<TItem> {
  readonly items: readonly TItem[];
  readonly nextCursor?: string;
}

export interface TimeRange {
  readonly startsAt: IsoDateTime;
  readonly endsAt?: IsoDateTime;
}

export interface MetadataCarrier {
  readonly metadata?: JsonObject;
}
