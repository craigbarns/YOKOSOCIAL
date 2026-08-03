export interface RobotsRule {
  directive: "allow" | "disallow";
  path: string;
}

export interface ParsedRobots {
  rules: RobotsRule[];
  disallowedPaths: string[];
  isAllowed(url: string | URL): boolean;
}

interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const withoutAnchor = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = withoutAnchor.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}${anchored ? "$" : ""}`);
}

export function parseRobotsTxt(content: string, userAgent: string): ParsedRobots {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | undefined;
  let hasRules = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (name === "user-agent") {
      if (!current || hasRules) {
        current = { agents: [], rules: [] };
        groups.push(current);
        hasRules = false;
      }
      current.agents.push(value.toLowerCase());
      continue;
    }

    if (!current || (name !== "allow" && name !== "disallow")) continue;
    hasRules = true;
    if (!value) continue;
    current.rules.push({ directive: name, path: value });
  }

  const normalizedAgent = userAgent.toLowerCase();
  const matchingGroups = groups.filter((group) =>
    group.agents.some((agent) => agent === "*" || normalizedAgent.includes(agent))
  );
  const exactGroups = matchingGroups.filter((group) => group.agents.some((agent) => agent !== "*"));
  const selectedGroups = exactGroups.length > 0 ? exactGroups : matchingGroups;
  const rules = selectedGroups.flatMap((group) => group.rules);

  return {
    rules,
    disallowedPaths: rules.filter((rule) => rule.directive === "disallow").map((rule) => rule.path),
    isAllowed(rawUrl): boolean {
      const url = rawUrl instanceof URL ? rawUrl : new URL(rawUrl);
      const candidate = `${url.pathname}${url.search}`;
      const matchingRules = rules
        .filter((rule) => patternToRegExp(rule.path).test(candidate))
        .sort((left, right) => right.path.length - left.path.length);
      const winner = matchingRules[0];
      if (!winner) return true;
      const equallySpecific = matchingRules.filter(
        (rule) => rule.path.length === winner.path.length
      );
      return equallySpecific.some((rule) => rule.directive === "allow");
    }
  };
}
