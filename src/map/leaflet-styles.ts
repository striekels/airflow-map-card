import { css, unsafeCSS, type CSSResult } from 'lit';
import leafletCss from 'leaflet/dist/leaflet.css?inline';

/**
 * Leaflet's stylesheet plus the text-selection fix it does not ship.
 *
 * Leaflet marks only tiles, markers and marker shadows unselectable. Its
 * container, the attribution line and the zoom control are all left selectable,
 * and Leaflet's runtime suppression only starts once a map drag has begun. So a
 * press that lands on the attribution or on a zoom button is not a map drag at
 * all, and dragging from there selects the text instead of moving the map,
 * leaving a blue highlight across the corner of the card.
 *
 * Setting it on the container is enough because user-select inherits, and
 * nothing inside Leaflet sets it back to auto.
 *
 * Both the card and the editor's picker embed Leaflet, so this lives here
 * rather than being repeated in each of them and fixed in only one.
 */
export const leafletStyles: CSSResult = css`
  ${unsafeCSS(leafletCss)}

  .leaflet-container {
    user-select: none;
    -webkit-user-select: none;
  }

  /* Otherwise the attribution and zoom links start a link drag of their own. */
  .leaflet-container a {
    -webkit-user-drag: none;
  }
`;
