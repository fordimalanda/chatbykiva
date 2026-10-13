import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
const WSClient = require('ws');

export interface KivaEvent {
  event: 'set' | 'update' | 'del' | 'subscribed' | 'reset' | string;
  key?: string;
  type?: string | null;
  workspace?: string;
  timestamp?: number;
  pattern?: string;
}

export type KivaEventListener = (event: KivaEvent) => void;

@Injectable()
export class KivaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KivaService.name);
  private readonly baseUrl = process.env.KIVADB_URL || 'http://127.0.0.1:8080';
  private readonly wsUrl = process.env.KIVADB_WS || 'ws://127.0.0.1:8080/ws';
  public readonly workspace = 'social_app';

  private ws: any = null;
  private listeners: Set<KivaEventListener> = new Set();
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isDestroyed = false;

  async onModuleInit() {
    await this.ensureWorkspaceExists();
    this.connectWebSocket();
  }

  onModuleDestroy() {
    this.isDestroyed = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Ensures the social_app workspace exists in KivaDB
   */
  async ensureWorkspaceExists(): Promise<void> {
    try {
      const res = await this.exec(`workspace create ${this.workspace}`);
      this.logger.log(`KivaDB Workspace initialized: ${JSON.stringify(res)}`);
    } catch (err: any) {
      // Ignored if workspace already exists
      this.logger.debug(`Workspace check: ${err.message}`);
    }
  }

  /**
   * Get value of a key
   */
  async get<T = any>(key: string): Promise<T | null> {
    try {
      const url = `${this.baseUrl}/v1/key/${encodeURIComponent(key)}?workspace=${this.workspace}`;
      const res = await fetch(url);
      if (!res.ok) {
        return null;
      }
      const json = await res.json();
      if (json.status === 'ok') {
        return json.data as T;
      }
      return null;
    } catch (err: any) {
      this.logger.error(`Error getting key ${key}: ${err.message}`);
      return null;
    }
  }

  /**
   * Put/Set key value document
   */
  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    try {
      let url = `${this.baseUrl}/v1/key/${encodeURIComponent(key)}?workspace=${this.workspace}`;
      if (ttl && ttl > 0) {
        url += `&ttl=${ttl}`;
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      });
      const json = await res.json();
      return json.status === 'ok';
    } catch (err: any) {
      this.logger.error(`Error setting key ${key}: ${err.message}`);
      return false;
    }
  }

  /**
   * Delete key
   */
  async delete(key: string): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/v1/key/${encodeURIComponent(key)}?workspace=${this.workspace}`;
      const res = await fetch(url, { method: 'DELETE' });
      const json = await res.json();
      return json.status === 'ok' && !!json.deleted;
    } catch (err: any) {
      this.logger.error(`Error deleting key ${key}: ${err.message}`);
      return false;
    }
  }

  /**
   * Scan keys matching pattern
   */
  async scan(pattern: string = '*', limit: number = 500): Promise<Array<{ key: string; type: string; size: number; modified: number; ttl: number | null }>> {
    try {
      const url = `${this.baseUrl}/v1/scan?pattern=${encodeURIComponent(pattern)}&limit=${limit}&workspace=${this.workspace}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.status === 'ok' && Array.isArray(json.data)) {
        return json.data;
      }
      return [];
    } catch (err: any) {
      this.logger.error(`Error scanning pattern ${pattern}: ${err.message}`);
      return [];
    }
  }

  /**
   * Range query with values
   */
  async range<T = any>(from: string, to?: string, limit: number = 500): Promise<Array<{ key: string; type: string; data: T; ttl: number | null }>> {
    try {
      let url = `${this.baseUrl}/v1/range?from=${encodeURIComponent(from)}&limit=${limit}&workspace=${this.workspace}`;
      if (to) {
        url += `&to=${encodeURIComponent(to)}`;
      }
      const res = await fetch(url);
      const json = await res.json();
      if (json.status === 'ok' && Array.isArray(json.data)) {
        return json.data;
      }
      return [];
    } catch (err: any) {
      this.logger.error(`Error fetching range ${from}: ${err.message}`);
      return [];
    }
  }

  /**
   * Execute raw KivaDB command
   */
  async exec(command: string): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/v1/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    });
    const json = await res.json();
    if (json.ok && Array.isArray(json.output)) {
      return json.output;
    }
    throw new Error(json.error || 'Exec failed');
  }

  /**
   * Subscribe to real-time events from KivaDB WebSocket
   */
  addEventListener(listener: KivaEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private connectWebSocket() {
    if (this.isDestroyed) return;

    try {
      const targetUrl = `${this.wsUrl}?workspace=${this.workspace}`;
      this.logger.log(`Connecting to KivaDB WebSocket: ${targetUrl}`);
      this.ws = new WSClient(targetUrl);

      this.ws.on('open', () => {
        this.logger.log(`Connected to KivaDB WebSocket stream on workspace [${this.workspace}]`);
      });

      this.ws.on('message', (data: Buffer | string) => {
        try {
          const raw = data.toString();
          const parsed = JSON.parse(raw) as KivaEvent;
          for (const listener of this.listeners) {
            try {
              listener(parsed);
            } catch (err: any) {
              this.logger.error(`Listener error: ${err.message}`);
            }
          }
        } catch (err: any) {
          this.logger.warn(`Failed to parse KivaDB WS message: ${err.message}`);
        }
      });

      this.ws.on('close', () => {
        this.logger.warn('KivaDB WebSocket connection closed. Scheduling reconnect...');
        this.scheduleReconnect();
      });

      this.ws.on('error', (err: any) => {
        this.logger.warn(`KivaDB WebSocket error: ${err.message}`);
        this.ws?.close();
      });
    } catch (err: any) {
      this.logger.error(`Failed to initiate WebSocket connection: ${err.message}`);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.isDestroyed || this.reconnectTimeout) return;
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connectWebSocket();
    }, 2000);
  }
}
