/**
 * The building every harness and every screenshot uses: the Rietveld Schroder
 * House in Utrecht.
 *
 * A deliberate choice, not a placeholder. It is a museum rather than anyone's
 * home, so no screenshot of it can leak an address, and it is a real house on a
 * real street, so the outline, the facade angle and the neighbours all look like
 * what a user will actually see. A synthetic rectangle in an empty field would
 * photograph as a lie.
 *
 * The footprint is the genuine OpenStreetMap way, which is also what the
 * editor's Detect button returns for it.
 */
export const DEMO_HOUSE = {
  latitude: 52.085327,
  longitude: 5.147578,
  zoom: 18,
  /** Outward normal of the long street-facing wall, facing Prins Hendriklaan. */
  facadeBearing: 118.2,
  footprint: [
    [52.085307, 5.147492],
    [52.085386, 5.147561],
    [52.085376, 5.147589],
    [52.085379, 5.147592],
    [52.085375, 5.147602],
    [52.085374, 5.147601],
    [52.085354, 5.14766],
    [52.085297, 5.147607],
    [52.085295, 5.147613],
    [52.085293, 5.147611],
    [52.085297, 5.1476],
    [52.085277, 5.147582],
    [52.085294, 5.147535],
    [52.085292, 5.147533],
  ] as Array<[number, number]>,
};
