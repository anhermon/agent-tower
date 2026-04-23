import type { JsonObject, MetadataCarrier } from "./common.js";

export const SKILL_STATUSES = {
  Draft: "draft",
  Active: "active",
  Deprecated: "deprecated",
  Disabled: "disabled",
} as const;

export type SkillStatus = (typeof SKILL_STATUSES)[keyof typeof SKILL_STATUSES];

export const SKILL_SOURCE_KINDS = {
  Local: "local",
  Git: "git",
  Registry: "registry",
  Inline: "inline",
} as const;

export type SkillSourceKind = (typeof SKILL_SOURCE_KINDS)[keyof typeof SKILL_SOURCE_KINDS];

export interface SkillSource {
  readonly kind: SkillSourceKind;
  readonly uri: string;
  readonly ref?: string;
}

export interface SkillDescriptor extends MetadataCarrier {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly status: SkillStatus;
  readonly source: SkillSource;
  readonly description?: string;
  readonly capabilities?: readonly string[];
  readonly configurationSchema?: JsonObject;
}

export interface SkillActivation {
  readonly id: string;
  readonly skillId: string;
  readonly agentId: string;
  readonly enabled: boolean;
  readonly configuration?: JsonObject;
  readonly activatedAt: string;
}
