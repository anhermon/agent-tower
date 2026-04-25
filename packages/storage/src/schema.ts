export enum StorageTableName {
  Agents = "agents",
  Sessions = "sessions",
  Events = "events",
  Webhooks = "webhooks",
  ModuleRegistry = "module_registry",
  AuditEntries = "audit_entries",
  Tickets = "tickets",
}

export enum StorageFieldType {
  Boolean = "boolean",
  Json = "json",
  Number = "number",
  String = "string",
  Timestamp = "timestamp",
}

export interface StorageFieldDescriptor {
  readonly name: string;
  readonly type: StorageFieldType;
  readonly required: boolean;
  readonly primaryKey?: boolean;
  readonly indexed?: boolean;
  readonly unique?: boolean;
}

export interface StorageSchemaDescriptor {
  readonly tableName: StorageTableName;
  readonly fields: readonly StorageFieldDescriptor[];
}

export const AGENT_SCHEMA: StorageSchemaDescriptor = {
  tableName: StorageTableName.Agents,
  fields: [
    { name: "id", type: StorageFieldType.String, required: true, primaryKey: true },
    { name: "name", type: StorageFieldType.String, required: true, indexed: true },
    { name: "status", type: StorageFieldType.String, required: true, indexed: true },
    { name: "capabilities", type: StorageFieldType.Json, required: true },
    { name: "metadata", type: StorageFieldType.Json, required: false },
    { name: "createdAt", type: StorageFieldType.Timestamp, required: true },
    { name: "updatedAt", type: StorageFieldType.Timestamp, required: true },
  ],
};

export const SESSION_SCHEMA: StorageSchemaDescriptor = {
  tableName: StorageTableName.Sessions,
  fields: [
    { name: "id", type: StorageFieldType.String, required: true, primaryKey: true },
    { name: "agentId", type: StorageFieldType.String, required: true, indexed: true },
    { name: "status", type: StorageFieldType.String, required: true, indexed: true },
    { name: "startedAt", type: StorageFieldType.Timestamp, required: true },
    { name: "endedAt", type: StorageFieldType.Timestamp, required: false },
    { name: "metadata", type: StorageFieldType.Json, required: false },
  ],
};

export const EVENT_SCHEMA: StorageSchemaDescriptor = {
  tableName: StorageTableName.Events,
  fields: [
    { name: "id", type: StorageFieldType.String, required: true, primaryKey: true },
    { name: "sequence", type: StorageFieldType.Number, required: true, unique: true },
    { name: "type", type: StorageFieldType.String, required: true, indexed: true },
    { name: "sourceKind", type: StorageFieldType.String, required: true, indexed: true },
    { name: "sourceId", type: StorageFieldType.String, required: true, indexed: true },
    { name: "payload", type: StorageFieldType.Json, required: true },
    { name: "occurredAt", type: StorageFieldType.Timestamp, required: true },
    { name: "appendedAt", type: StorageFieldType.Timestamp, required: true },
  ],
};

export const WEBHOOK_SCHEMA: StorageSchemaDescriptor = {
  tableName: StorageTableName.Webhooks,
  fields: [
    { name: "id", type: StorageFieldType.String, required: true, primaryKey: true },
    { name: "provider", type: StorageFieldType.String, required: true, indexed: true },
    { name: "status", type: StorageFieldType.String, required: true, indexed: true },
    { name: "receivedAt", type: StorageFieldType.Timestamp, required: true },
    { name: "processedAt", type: StorageFieldType.Timestamp, required: false },
    { name: "headers", type: StorageFieldType.Json, required: true },
    { name: "payload", type: StorageFieldType.Json, required: true },
  ],
};

export const MODULE_REGISTRY_SCHEMA: StorageSchemaDescriptor = {
  tableName: StorageTableName.ModuleRegistry,
  fields: [
    { name: "id", type: StorageFieldType.String, required: true, primaryKey: true },
    { name: "name", type: StorageFieldType.String, required: true, indexed: true },
    { name: "version", type: StorageFieldType.String, required: true, indexed: true },
    { name: "status", type: StorageFieldType.String, required: true, indexed: true },
    { name: "manifest", type: StorageFieldType.Json, required: true },
    { name: "registeredAt", type: StorageFieldType.Timestamp, required: true },
    { name: "updatedAt", type: StorageFieldType.Timestamp, required: true },
  ],
};

export const AUDIT_ENTRY_SCHEMA: StorageSchemaDescriptor = {
  tableName: StorageTableName.AuditEntries,
  fields: [
    { name: "id", type: StorageFieldType.String, required: true, primaryKey: true },
    { name: "action", type: StorageFieldType.String, required: true, indexed: true },
    { name: "actorKind", type: StorageFieldType.String, required: true, indexed: true },
    { name: "actorId", type: StorageFieldType.String, required: true, indexed: true },
    { name: "targetKind", type: StorageFieldType.String, required: true, indexed: true },
    { name: "targetId", type: StorageFieldType.String, required: true, indexed: true },
    { name: "metadata", type: StorageFieldType.Json, required: false },
    { name: "createdAt", type: StorageFieldType.Timestamp, required: true },
  ],
};

export const TICKET_SCHEMA: StorageSchemaDescriptor = {
  tableName: StorageTableName.Tickets,
  fields: [
    { name: "id", type: StorageFieldType.String, required: true, primaryKey: true },
    { name: "title", type: StorageFieldType.String, required: true },
    { name: "status", type: StorageFieldType.String, required: true, indexed: true },
    { name: "priority", type: StorageFieldType.String, required: true, indexed: true },
    { name: "description", type: StorageFieldType.String, required: false },
    { name: "assigneeAgentId", type: StorageFieldType.String, required: false, indexed: true },
    { name: "sessionId", type: StorageFieldType.String, required: false, indexed: true },
    { name: "externalUrl", type: StorageFieldType.String, required: false },
    { name: "metadata", type: StorageFieldType.Json, required: false },
    { name: "createdAt", type: StorageFieldType.Timestamp, required: true },
    { name: "updatedAt", type: StorageFieldType.Timestamp, required: true },
  ],
};

export const STORAGE_SCHEMAS = [
  AGENT_SCHEMA,
  SESSION_SCHEMA,
  EVENT_SCHEMA,
  WEBHOOK_SCHEMA,
  MODULE_REGISTRY_SCHEMA,
  AUDIT_ENTRY_SCHEMA,
  TICKET_SCHEMA,
] as const;
