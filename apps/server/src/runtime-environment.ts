/** Source processes must not inherit the gateway's device-owner authority. */
export function runtimeEnvironment(environment: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(environment).filter(([name]) => {
    const normalized = name.toUpperCase();
    return normalized !== "ORCHESTRATOR_MASTER_KEY"
      && !normalized.startsWith("ORCHESTRATOR_PHONE_")
      && !normalized.startsWith("PHONE_CONTROL_");
  }));
}
