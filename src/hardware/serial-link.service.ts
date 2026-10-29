import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { TelemetryService } from '../telemetry/telemetry.service';
import { TelemetryGateway } from '../telemetry/telemetry.gateway';
import { TelemetryIngestSchema } from '../telemetry/dto/telemetry.dto';

const MOT_PREFIX = 'AG_MOT:';
const TLM_PREFIX = 'AG_TLM:';
const POLL_INTERVAL_MS = 4;
const RECONNECT_INTERVAL_MS = 4000;
const FALLBACK_TIMEOUT_MS = 3000;
const BAUD_CANDIDATES_BASE = [921600, 460800, 115200];
const MOT_RING_CAP = 128;
const TLM_RING_CAP = 16;
const MAX_DRAIN_ITERATIONS = 64;
const RX_BUFFER_LIMIT = 8192;

export interface SerialLinkStatus {
  connected: boolean;
  port: string | null;
  baud: number;
  baud_effective: number;
  frames_received: number;
  frames_rejected: number;
  bytes_received: number;
  last_frame_at: number | null;
  last_error: string | null;
  mot_frames: number;
  tlm_frames: number;
  mot_hz: number;
  tlm_hz: number;
  last_mot_age_ms: number | null;
  last_tlm_age_ms: number | null;
  rx_buffer_overflow: number;
}

@Injectable()
export class SerialLinkService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SerialLinkService.name);
  private fd: number | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private fallbackTimer: NodeJS.Timeout | null = null;
  private rxBuffer = '';
  private devicePath: string | null = null;
  private readonly readBuffer = Buffer.alloc(4096);
  private consecutiveReadErrors = 0;

  private readonly baudCandidates: number[];
  private baudIndex = 0;
  private currentBaud: number;
  private validFrameReceived = false;

  private readonly motRing = new Array<number>(MOT_RING_CAP).fill(0);
  private motRingHead = 0;
  private motRingCount = 0;
  private readonly tlmRing = new Array<number>(TLM_RING_CAP).fill(0);
  private tlmRingHead = 0;
  private tlmRingCount = 0;

  private lastMotAt: number | null = null;
  private lastTlmAt: number | null = null;

  private readonly status: SerialLinkStatus;

  constructor(
    private readonly telemetryService: TelemetryService,
    private readonly telemetryGateway: TelemetryGateway,
  ) {
    const envBaud = Number(process.env.SERIAL_BAUD ?? 921600);
    this.baudCandidates = BAUD_CANDIDATES_BASE.includes(envBaud)
      ? BAUD_CANDIDATES_BASE
      : [envBaud, ...BAUD_CANDIDATES_BASE];
    this.baudIndex = Math.max(0, this.baudCandidates.indexOf(envBaud));
    if (this.baudIndex < 0) this.baudIndex = 0;
    this.currentBaud = this.baudCandidates[this.baudIndex];

    this.status = {
      connected: false,
      port: null,
      baud: this.currentBaud,
      baud_effective: this.currentBaud,
      frames_received: 0,
      frames_rejected: 0,
      bytes_received: 0,
      last_frame_at: null,
      last_error: null,
      mot_frames: 0,
      tlm_frames: 0,
      mot_hz: 0,
      tlm_hz: 0,
      last_mot_age_ms: null,
      last_tlm_age_ms: null,
      rx_buffer_overflow: 0,
    };
  }

  async onModuleInit() {
    if (process.env.SERIAL_LINK_ENABLED === 'false') {
      this.logger.warn('🔌 Enlace serie deshabilitado por SERIAL_LINK_ENABLED=false');
      return;
    }
    this.telemetryService.setCommandEmitter((deviceId, command) =>
      this.sendCommand(deviceId, command),
    );
    await this.connect();
  }

  onModuleDestroy() {
    this.stopPolling();
    this.clearFallbackTimer();
    this.closePort();
  }

  getStatus(): SerialLinkStatus {
    const now = Date.now();
    const motInWindow = this.countInWindow(this.motRing, this.motRingCount, this.motRingHead, MOT_RING_CAP, now);
    const tlmInWindow = this.countInWindow(this.tlmRing, this.tlmRingCount, this.tlmRingHead, TLM_RING_CAP, now);

    return {
      ...this.status,
      baud: this.currentBaud,
      baud_effective: this.currentBaud,
      mot_hz: Math.round((motInWindow * 10)) / 10,
      tlm_hz: Math.round((tlmInWindow * 10)) / 10,
      last_mot_age_ms: this.lastMotAt === null ? null : now - this.lastMotAt,
      last_tlm_age_ms: this.lastTlmAt === null ? null : now - this.lastTlmAt,
      last_frame_at: this.status.last_frame_at,
    };
  }

  private countInWindow(
    ring: number[],
    count: number,
    head: number,
    cap: number,
    now: number,
  ): number {
    if (count === 0) return 0;
    let result = 0;
    const oldest = count < cap ? 0 : head;
    for (let i = 0; i < count; i++) {
      const idx = (oldest + i) % cap;
      const ts = ring[idx];
      if (ts > 0 && now - ts <= 1000) result += 1;
    }
    return result;
  }

  async connect(): Promise<boolean> {
    this.closePort();
    const target = this.resolvePort();
    if (!target) {
      this.status.connected = false;
      this.status.last_error = 'NO_SERIAL_DEVICE';
      this.scheduleReconnect();
      return false;
    }

    try {
      this.configureTermios(target);
      this.fd = fs.openSync(
        target,
        fs.constants.O_RDWR | fs.constants.O_NOCTTY | fs.constants.O_NONBLOCK,
      );
    } catch (error) {
      this.status.connected = false;
      this.status.last_error = (error as Error).message;
      this.logger.warn(`🔌 No se pudo abrir ${target}: ${(error as Error).message}`);
      this.scheduleReconnect();
      return false;
    }

    this.devicePath = target;
    this.status.connected = true;
    this.status.port = target;
    this.status.last_error = null;
    this.rxBuffer = '';
    this.consecutiveReadErrors = 0;
    this.validFrameReceived = false;
    this.currentBaud = this.baudCandidates[this.baudIndex];
    this.status.baud = this.currentBaud;
    this.status.baud_effective = this.currentBaud;
    this.logger.log(`🔌 Enlace serie local activo en ${target} @ ${this.currentBaud} baudios`);
    this.startPolling();
    this.armFallbackTimer();
    return true;
  }

  sendCommand(
    deviceId: string,
    command: { view_mode?: string; emotion?: string },
  ): boolean {
    if (this.fd === null) return false;
    const payload: Record<string, string> = { cmd: 'SET_EMOTION' };
    if (command.emotion) payload.emotion = command.emotion;
    if (command.view_mode) payload.view_mode = command.view_mode;
    try {
      fs.writeSync(this.fd, `${JSON.stringify(payload)}\n`);
      this.logger.log(
        `⚡ Comando por cable hacia [${deviceId}]: ${JSON.stringify(payload)}`,
      );
      return true;
    } catch (error) {
      this.status.last_error = (error as Error).message;
      return false;
    }
  }

  private resolvePort(): string | null {
    const explicit = process.env.SERIAL_PORT;
    if (explicit && fs.existsSync(explicit)) return explicit;

    const byIdDir = '/dev/serial/by-id';
    if (fs.existsSync(byIdDir)) {
      const candidates = fs
        .readdirSync(byIdDir)
        .filter((name) => /usb|cp210|ch34|ftdi|esp/i.test(name))
        .map((name) => path.join(byIdDir, name))
        .filter((candidate) => fs.existsSync(candidate));
      if (candidates.length > 0) return candidates[0];
    }

    for (const pattern of ['/dev/ttyUSB*', '/dev/ttyACM*']) {
      const matches = fs
        .readdirSync('/dev')
        .filter((name) => new RegExp(`^${pattern.replace('*', '.*')}$`).test(name))
        .sort();
      if (matches.length > 0) return path.join('/dev', matches[0]);
    }

    return null;
  }

  private configureTermios(device: string) {
    try {
      execFileSync('stty', [
        '-F',
        device,
        String(this.currentBaud),
        'raw',
        '-echo',
        '-hupcl',
      ]);
    } catch (error) {
      this.logger.warn(
        `⚠️ No se pudo aplicar termios a ${device}: ${(error as Error).message}`,
      );
    }
  }

  private armFallbackTimer() {
    this.clearFallbackTimer();
    this.fallbackTimer = setTimeout(() => {
      if (this.validFrameReceived) return;
      this.logger.warn(
        `⏱️ Sin trama válida en ${FALLBACK_TIMEOUT_MS} ms @ ${this.currentBaud}, probando siguiente baud...`,
      );
      this.closePort();
      this.baudIndex = (this.baudIndex + 1) % this.baudCandidates.length;
      this.scheduleReconnect();
    }, FALLBACK_TIMEOUT_MS);
    this.fallbackTimer.unref?.();
  }

  private clearFallbackTimer() {
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }

  private startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => this.readAvailable(), POLL_INTERVAL_MS);
    this.pollTimer.unref?.();
  }

  private stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private readAvailable() {
    if (this.fd === null) return;
    const buffer = this.readBuffer;
    let iterations = 0;
    while (iterations < MAX_DRAIN_ITERATIONS) {
      iterations += 1;
      try {
        const read = fs.readSync(this.fd, buffer, 0, buffer.length, null);
        if (read > 0) {
          this.status.bytes_received += read;
          this.consecutiveReadErrors = 0;
          this.consumeChunk(buffer.subarray(0, read).toString('utf8'));
          continue;
        }
        break;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'EAGAIN' || code === 'EWOULDBLOCK') {
          break;
        }
        this.consecutiveReadErrors += 1;
        this.status.last_error = `${code}: ${(error as Error).message}`;
        if (this.consecutiveReadErrors > 20) {
          this.logger.error('🔌 Puerto serie perdido, reintentando conexión...');
          this.closePort();
          this.scheduleReconnect();
        }
        break;
      }
    }
  }

  private consumeChunk(chunk: string) {
    this.rxBuffer += chunk;
    const segments = this.rxBuffer.split('\n');
    this.rxBuffer = segments.pop() ?? '';
    for (const segment of segments) {
      this.consumeLine(segment.trim());
    }
    if (this.rxBuffer.length > RX_BUFFER_LIMIT) {
      this.rxBuffer = '';
      this.status.rx_buffer_overflow += 1;
      this.status.frames_rejected += 1;
    }
  }

  private consumeLine(line: string) {
    if (line.startsWith(TLM_PREFIX)) {
      const payload = line.slice(TLM_PREFIX.length);
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        this.status.frames_rejected += 1;
        return;
      }
      const result = TelemetryIngestSchema.safeParse(parsed);
      if (!result.success) {
        this.status.frames_rejected += 1;
        return;
      }
      this.status.frames_received += 1;
      this.status.tlm_frames += 1;
      const tlmNow = Date.now();
      this.status.last_frame_at = tlmNow;
      this.lastTlmAt = tlmNow;

      this.tlmRing[this.tlmRingHead] = tlmNow;
      this.tlmRingHead = (this.tlmRingHead + 1) % TLM_RING_CAP;
      if (this.tlmRingCount < TLM_RING_CAP) this.tlmRingCount += 1;
      if (!this.validFrameReceived) {
        this.validFrameReceived = true;
        this.clearFallbackTimer();
      }
      this.telemetryService.processAndBroadcast(result.data, 'hardware');
      return;
    }

    if (line.startsWith(MOT_PREFIX)) {
      const payload = line.slice(MOT_PREFIX.length);
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        this.status.frames_rejected += 1;
        return;
      }
      if (typeof parsed !== 'object' || parsed === null) {
        this.status.frames_rejected += 1;
        return;
      }
      const o = parsed as Record<string, unknown>;

      const ts = o.ts;
      const p = o.p;
      const r = o.r;
      const ax = o.ax;
      const ay = o.ay;
      const az = o.az;
      const e = o.e;
      const sh = o.sh;

      const valid =
        typeof ts === 'number' &&
        Number.isFinite(ts) &&
        typeof p === 'number' &&
        Number.isFinite(p) &&
        p >= -180 &&
        p <= 180 &&
        typeof r === 'number' &&
        Number.isFinite(r) &&
        r >= -180 &&
        r <= 180 &&
        typeof ax === 'number' &&
        Number.isFinite(ax) &&
        ax >= -40 &&
        ax <= 40 &&
        typeof ay === 'number' &&
        Number.isFinite(ay) &&
        ay >= -40 &&
        ay <= 40 &&
        typeof az === 'number' &&
        Number.isFinite(az) &&
        az >= -40 &&
        az <= 40 &&
        typeof e === 'string' &&
        e.length <= 24 &&
        (typeof sh === 'boolean' || sh === 0 || sh === 1);

      if (!valid) {
        this.status.frames_rejected += 1;
        return;
      }

      this.status.mot_frames += 1;
      const now = Date.now();
      this.lastMotAt = now;
      if (this.status.last_frame_at === null || now >= this.status.last_frame_at) {
        this.status.last_frame_at = now;
      }
      if (!this.validFrameReceived) {
        this.validFrameReceived = true;
        this.clearFallbackTimer();
      }

      this.motRing[this.motRingHead] = now;
      this.motRingHead = (this.motRingHead + 1) % MOT_RING_CAP;
      if (this.motRingCount < MOT_RING_CAP) this.motRingCount += 1;

      const motionPayload = {
        ts,
        p,
        r,
        ax,
        ay,
        az,
        e,
        sh,
      };

      this.telemetryGateway.broadcastMotion(motionPayload);
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, RECONNECT_INTERVAL_MS);
    this.reconnectTimer.unref?.();
  }

  private closePort() {
    this.clearFallbackTimer();
    if (this.fd !== null) {
      try {
        fs.closeSync(this.fd);
      } catch {
        // el descriptor ya estaba cerrado por el sistema
      }
      this.fd = null;
    }
    this.stopPolling();
    this.status.connected = false;
  }
}