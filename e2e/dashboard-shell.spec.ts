import { expect, test } from "@playwright/test";

const MODULE_ROUTES = [
  { path: "/sessions", emptyState: "No session records" },
  { path: "/webhooks", emptyState: "Webhooks are not configured" },
  { path: "/agents", emptyState: "No agent runtimes" },
  { path: "/kanban", emptyState: "No ticket source configured" },
  { path: "/skills", emptyState: "No skills discovered" },
  { path: "/mcps", emptyState: "No MCP servers" },
  { path: "/channels", emptyState: "No channels connected" },
  { path: "/replay", emptyState: "No replay traces" },
];

test("given_the_dashboard_is_running__when_opening_home__then_the_shell_is_visible", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Control Plane" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByText("Live Activity")).toBeVisible();
  await expect(page.getByText("No live events")).toBeVisible();
  await expect(page.getByText("No agent runtimes")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("given_light_theme__when_toggling_dark_mode__then_the_shell_switches_theme", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("control-plane:theme", "light");
  });
  await page.goto("/");

  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
});

for (const route of MODULE_ROUTES) {
  test(`given_the_dashboard_is_running__when_opening_${route.path.slice(1)}__then_the_empty_module_route_loads`, async ({
    page,
  }) => {
    await page.goto(route.path);

    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await expect(page.getByText(route.emptyState)).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  });
}
