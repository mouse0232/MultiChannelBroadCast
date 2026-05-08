export function getEnv(env, context, key) {
  return (
    env?.[key] ??
    context?.locals?.runtime?.env?.[key] ??
    context?.locals?.env?.[key] ??
    process.env?.[key] ??
    undefined
  )
}
