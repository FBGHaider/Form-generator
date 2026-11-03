/** The Alert Gatehouse logo, on its white tile so it reads in light and dark mode. */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <img className="logo" src={`${import.meta.env.BASE_URL}logo.png`} width={size} height={size} alt="Alert Gatehouse" />
  )
}
