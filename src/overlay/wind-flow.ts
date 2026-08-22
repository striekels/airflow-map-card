import { toMetresPerSecond } from '../data/wind-speed';

/**
 * Animated wind flow over the map: particles carried by the wind.
 *
 * **This is a uniform flow, not a wind field.** Windy and its imitators advect
 * particles through a grid of vectors from a weather model, which is where the
 * swirls and convergence lines come from. A Home Assistant weather entity
 * reports one vector at one point, so there is no field here and no honest way
 * to invent one: every particle moves the same direction at the same speed.
 *
 * That is the point rather than a compromise. The arrow already states
 * direction precisely; what it cannot show is speed, which until now existed
 * only as a number in a text row, so a 4 km/h breeze and a 40 km/h gale drew an
 * identical arrow. Particle velocity and density make that difference visible
 * at a glance, and a uniform flow claims exactly as much as the data supports.
 *
 * Deliberately not done: bending the flow around the building outline. It would
 * look wonderful and it would be fiction, and this card is a measuring tool laid
 * over a map.
 */

export interface FlowState {
  /** Direction the air travels towards, degrees clockwise from north. */
  bearing: number | null;
  /** Speed in `unit`. Null when the source has no reading. */
  speed: number | null;
  unit: string | null;
  color: string;
  opacity: number;
  /** Multiplier on the drawn speed. 1 is the tuned default pace. */
  pace: number;
}

interface Particle {
  x: number;
  y: number;
  /**
   * Pixels travelled since this particle entered, so it is recycled by distance
   * rather than by time. Counting frames instead tied a particle's reach to the
   * wind speed: at 3 km/h it could cross 7 per cent of the card before its life
   * ran out, so the whole field sat pinned against the upwind edge and the
   * middle of the map stayed empty.
   */
  travelled: number;
}

/** Trail length, as a fraction of one second of travel. */
const TRAIL = 0.2;
/**
 * How far a particle travels before it is reshuffled, in card spans.
 *
 * A little over one span, so a particle normally crosses the map and leaves
 * rather than being recycled mid-flight.
 */
const TRAVEL_SPANS = 1.4;
/** How much of the previous frame survives. Lower fades trails faster. */
const FADE = 0.9;

/**
 * Screen pixels per second, per metre per second of wind.
 *
 * Chosen by eye rather than derived. The map scale in metres per pixel changes
 * with zoom, so a physically faithful mapping would make the flow crawl at zoom
 * 19 and blur at zoom 12. This is a legibility scale, not a measurement.
 */
const PX_PER_MS = 8;

export class WindFlow {
  private canvas?: HTMLCanvasElement;
  private ctx?: CanvasRenderingContext2D | null;
  private particles: Particle[] = [];
  private frame?: number;
  private state: FlowState = {
    bearing: null,
    speed: null,
    unit: null,
    color: '#fff',
    opacity: 1,
    pace: 1,
  };
  private width = 0;
  private height = 0;
  private visible = true;
  private observer?: IntersectionObserver;
  private resize?: ResizeObserver;
  private readonly onVisibility = (): void => this.sync();

  attach(canvas: HTMLCanvasElement): void {
    if (this.canvas === canvas) return;
    this.detach();

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.measure();

    // A dashboard card runs for weeks on a wall tablet. Animating while
    // scrolled out of view, or behind another browser tab, is pure battery.
    this.observer = new IntersectionObserver((entries) => {
      this.visible = entries.some((entry) => entry.isIntersecting);
      this.sync();
    });
    this.observer.observe(canvas);

    this.resize = new ResizeObserver(() => this.measure());
    this.resize.observe(canvas);

    document.addEventListener('visibilitychange', this.onVisibility);
    this.sync();
  }

  update(state: FlowState): void {
    this.state = state;
    this.sync();
  }

  detach(): void {
    this.stop();
    this.observer?.disconnect();
    this.observer = undefined;
    this.resize?.disconnect();
    this.resize = undefined;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas = undefined;
    this.ctx = undefined;
    this.particles = [];
  }

  /** Exposed for the harness and tests: is the loop actually running. */
  get running(): boolean {
    return this.frame !== undefined;
  }

  private get reducedMotion(): boolean {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  private get active(): boolean {
    return (
      this.visible &&
      !document.hidden &&
      this.state.bearing !== null &&
      (this.state.speed ?? 0) > 0 &&
      this.width > 0
    );
  }

  private sync(): void {
    if (!this.active) {
      this.stop();
      this.clear();
      return;
    }

    // Seed on every sync, not only when starting the loop.
    //
    // Two bugs came from seeding inside the `!running` branch. `measure` empties
    // the particle array and then calls this, and a ResizeObserver always fires
    // once when it starts observing, so re-enabling the flow wiped the particles
    // immediately after seeding them and nothing refilled: the loop ran forever
    // over an empty array, drawing nothing on a blank canvas. The same guard
    // also froze density at whatever the speed was when the loop started, so the
    // count could never follow the wind it is supposed to be showing.
    //
    // `seed` only adds or removes the difference, so calling it often is cheap.
    this.seed();

    if (this.reducedMotion) {
      // One still frame: direction stays readable, nothing moves.
      this.stop();
      this.step(0);
      return;
    }
    if (!this.running) this.frame = requestAnimationFrame(this.tick);
  }

  private stop(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
  }

  private clear(): void {
    if (this.ctx && this.width) this.ctx.clearRect(0, 0, this.width, this.height);
  }

  private measure(): void {
    const canvas = this.canvas;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.width = rect.width;
    this.height = rect.height;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.particles = [];
    this.sync();
  }

  /**
   * Denser when it blows harder, so speed reads before you notice direction.
   *
   * The divisor and floor matter more than they look. An earlier pair put the
   * floor above the computed count for any card smaller than a phone screen, so
   * a 2 km/h breeze and a 40 km/h gale both drew 24 particles and density
   * carried no information at all. Measured across the range before settling
   * here: roughly 19 particles at 2 km/h and 71 at 80 on a 420 by 315 card.
   */
  private get count(): number {
    const area = this.width * this.height;
    const ms = toMetresPerSecond(this.state.speed ?? 0, this.state.unit);
    const strength = Math.min(1, ms / 12);
    return Math.round(Math.min(260, Math.max(14, (area / 2400) * (0.3 + strength))));
  }

  private seed(): void {
    const want = this.count;
    while (this.particles.length > want) this.particles.pop();
    while (this.particles.length < want) this.particles.push(this.spawn());
  }

  /** Distance a particle covers before being reshuffled. */
  private get maxTravel(): number {
    return Math.max(this.width, this.height) * TRAVEL_SPANS;
  }

  private spawn(): Particle {
    return {
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      // Staggered, so the field does not reshuffle in one visible wave.
      travelled: Math.random() * this.maxTravel,
    };
  }

  private readonly tick = (): void => {
    this.frame = requestAnimationFrame(this.tick);
    this.step(1 / 60);
  };

  private step(dt: number): void {
    const ctx = this.ctx;
    if (!ctx || this.state.bearing === null) return;

    // Fade the previous frame rather than clearing it. destination-out keeps
    // the canvas transparent over the map, which painting a dark rectangle
    // would not.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0, 0, 0, ' + (1 - FADE) + ')';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalCompositeOperation = 'source-over';

    const ms = toMetresPerSecond(this.state.speed ?? 0, this.state.unit);
    const px = ms * PX_PER_MS * (this.state.pace || 1);
    // Screen space: y grows downwards, and 0 degrees is north, so the compass
    // bearing is rotated a quarter turn to become a canvas angle.
    const radians = ((this.state.bearing - 90) * Math.PI) / 180;
    const vx = Math.cos(radians) * px;
    const vy = Math.sin(radians) * px;

    ctx.strokeStyle = this.state.color;
    // Faint on purpose: this sits on a map the user is trying to read.
    //
    // Lower than it looks, because trails compound. Each frame strokes a fresh
    // segment over the last one before it has finished fading, and the slower
    // the wind the more those segments overlap, so a nominal 0.45 measured 0.89
    // at the peak. Measured again after this change: peak around 0.6, mean
    // around 0.2.
    ctx.globalAlpha = this.state.opacity * 0.3;
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();

    for (const p of this.particles) {
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + vx * TRAIL, p.y + vy * TRAIL);

      p.x += vx * dt;
      p.y += vy * dt;
      p.travelled += Math.hypot(vx, vy) * dt;

      // Two different events, which used to share one outcome. A particle that
      // has blown off the map should re-enter from upwind, because that is
      // where the air is coming from. One that has merely been alive a long
      // while is just being reshuffled, and sending it to the edge as well is
      // what emptied the middle of the card in a light wind.
      const out = p.x < -40 || p.x > this.width + 40 || p.y < -40 || p.y > this.height + 40;
      if (out) {
        Object.assign(p, this.enterUpwind(vx, vy));
      } else if (p.travelled > this.maxTravel) {
        Object.assign(p, this.spawn(), { travelled: 0 });
      }
    }

    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /**
   * Re-enter through an upwind edge, chosen in proportion to how much flow
   * actually crosses each one.
   *
   * Picking the dominant axis instead left part of the map empty. A diagonal
   * wind has |vx| equal to |vy|, so a `>` comparison always chose the same edge
   * and every particle entered through the top; the side never fed, and the
   * region downwind of it emptied out as particles recycled. Weighting the
   * choice keeps both edges supplied, which is what a corner wind needs.
   */
  private enterUpwind(vx: number, vy: number): Particle {
    const p = this.spawn();
    p.travelled = 0;

    const total = Math.abs(vx) + Math.abs(vy);
    if (total === 0) return p;

    if (Math.random() < Math.abs(vx) / total) {
      p.x = vx > 0 ? -20 : this.width + 20;
      p.y = Math.random() * this.height;
    } else {
      p.y = vy > 0 ? -20 : this.height + 20;
      p.x = Math.random() * this.width;
    }
    return p;
  }
}
