/**
 * Wind speed in the units Home Assistant actually reports it in.
 *
 * Integrations report speed in whatever unit they please, and getting the
 * conversion wrong does not fail loudly: the flow simply moves at 3.6 times the
 * right rate for an m/s source, which looks plausible and is wrong. The same
 * mistake in the colour scale would paint a breeze as a gale.
 *
 * Lives here rather than beside the animation that first needed it because the
 * colour scale needs it too, and `data/` may not import from `overlay/`.
 */
export function toMetresPerSecond(speed: number, unit: string | null): number {
  switch ((unit ?? 'km/h').toLowerCase()) {
    case 'm/s':
      return speed;
    case 'mph':
      return speed * 0.44704;
    case 'kn':
    case 'kt':
    case 'knots':
      return speed * 0.514444;
    case 'ft/s':
      return speed * 0.3048;
    default:
      // km/h, and anything unrecognised. Home Assistant's own default.
      return speed / 3.6;
  }
}
