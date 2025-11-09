export function getEnv(env, context, key) {
  return env?.[key] ?? context?.locals?.runtime?.env?.[key]
}
