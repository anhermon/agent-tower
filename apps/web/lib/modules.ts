import type { ModuleDefinition } from "@/types/control-plane";

export const modules: ModuleDefinition[] = [
  {
    key: "overview",
    label: "Control Plane",
    href: "/",
    icon: "grid",
    description: "Fleet health, orchestration pressure, and recent control-plane events.",
    status: "degraded",
    phase: "skeleton",
    owner: "",
    docs: "docs/architecture/overview.md"
  },
  {
    key: "sessions",
    label: "Sessions",
    href: "/sessions",
    icon: "terminal",
    description: "Live and archived agent execution sessions.",
    status: "degraded",
    phase: "active",
    owner: "",
    docs: "docs/modules/sessions.md"
  },
  {
    key: "webhooks",
    label: "Webhooks",
    href: "/webhooks",
    icon: "hook",
    description: "Inbound event endpoints, deliveries, retries, and signatures.",
    status: "degraded",
    phase: "active",
    owner: "",
    docs: "docs/modules/webhooks.md"
  },
  {
    key: "agents",
    label: "Agents",
    href: "/agents",
    icon: "agent",
    description: "Runtime inventory, assignments, queues, and worker state.",
    status: "degraded",
    phase: "active",
    owner: "",
    docs: "docs/modules/agents.md"
  },
  {
    key: "kanban",
    label: "Kanban",
    href: "/kanban",
    icon: "board",
    description: "Work lanes and task movement across modular agents.",
    status: "degraded",
    phase: "active",
    owner: "",
    docs: "docs/modules/kanban.md"
  },
  {
    key: "skills",
    label: "Skills",
    href: "/skills",
    icon: "bolt",
    description: "Skill registry, versions, eligibility, and rollout state.",
    status: "degraded",
    phase: "active",
    owner: "",
    docs: "docs/modules/skills.md"
  },
  {
    key: "mcps",
    label: "MCPs",
    href: "/mcps",
    icon: "plug",
    description: "Connector servers, tools, resources, and availability.",
    status: "degraded",
    phase: "deferred",
    owner: "",
    docs: "docs/modules/mcps.md"
  },
  {
    key: "channels",
    label: "Channels",
    href: "/channels",
    icon: "signal",
    description: "Message routes, fan-out rules, and delivery health.",
    status: "degraded",
    phase: "deferred",
    owner: "",
    docs: "docs/modules/channels.md"
  },
  {
    key: "replay",
    label: "Replay",
    href: "/replay",
    icon: "replay",
    description: "Event replay controls and deterministic trace inspection.",
    status: "degraded",
    phase: "deferred",
    owner: "",
    docs: "docs/modules/replay.md"
  }
];

export function getModuleByHref(pathname: string): ModuleDefinition {
  return modules.find((module) => module.href === pathname) ?? modules[0];
}

export function getModuleByKey<Key extends ModuleDefinition["key"]>(
  key: Key
): ModuleDefinition & { key: Key } {
  const module = modules.find((item) => item.key === key);

  if (!module) {
    throw new Error(`Unknown module: ${key}`);
  }

  return module as ModuleDefinition & { key: Key };
}
