# Screenshots

Referenced from the project README, which keeps them commented out until they exist.

Worth capturing:

**`card.png`**: the card on a real dashboard. The point of the card is the verdict, so
frame it when the airflow is something other than "weak wind": the arrow coloured, the
house outline visible under it, and the info rows readable. A dark dashboard shows the
basemap theming off better than a light one.

**`editor.png`**: the **Where** section mid-alignment: the map over a real building, the
guide line lying along the front wall, and the bearing readout. This is the part people will
not believe works until they see it.

Keep them under about 1 MB each, and avoid anything that identifies a real address more
precisely than the feature needs: the test fixture in `test/footprint.test.ts` was sanitised
for the same reason.
