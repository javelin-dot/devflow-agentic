import { EventEmitter } from 'node:events';
import { db, newId } from '../db/index.js';
import type { Notification, NotificationChannel, NotificationDeliveryStatus } from '@devflow/shared';

export type NotificationEventType =
  | 'document.changed_after_approval'
  | 'document.pending_approval'
  | 'defect.status_changed'
  | 'release.pr_review_required'
  | 'subtask.error';

interface DispatchJob {
  notificationId: string;
  channel: NotificationChannel;
  payload: Record<string, unknown>;
  attempt: number;
}

class NotificationDispatcher extends EventEmitter {
  private queue: DispatchJob[] = [];
  private processing = false;

  dispatch(type: NotificationEventType, payload: Record<string, unknown>): void {
    // Find subscriptions for this event type
    const subs = db.prepare('SELECT * FROM notification_subscriptions WHERE event_type=?')
      .all(type) as Array<Record<string, unknown>>;

    if (subs.length === 0) {
      // Default: create an inapp notification for local-admin
      this.createNotification(type, payload, 'inapp', null);
      return;
    }

    for (const sub of subs) {
      this.createNotification(type, payload, sub.channel as NotificationChannel, (sub.user_id as string) || null);
    }
  }

  private createNotification(
    type: string,
    payload: Record<string, unknown>,
    channel: NotificationChannel,
    userId: string | null
  ): void {
    const id = newId('ntf');
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO notifications (id, user_id, type, payload, channel, read_at, created_at, delivery_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, userId, type, JSON.stringify(payload), channel, null, now, 'pending');

    this.queue.push({ notificationId: id, channel, payload, attempt: 0 });
    this.processQueue();
  }

  private processQueue(): void {
    if (this.processing) return;
    this.processing = true;

    const processNext = () => {
      const job = this.queue.shift();
      if (!job) {
        this.processing = false;
        return;
      }

      this.deliver(job).then(() => {
        // Exponential backoff delay before next job
        setTimeout(processNext, 50);
      }).catch(() => {
        setTimeout(processNext, 50);
      });
    };

    processNext();
  }

  private async deliver(job: DispatchJob): Promise<void> {
    job.attempt++;

    try {
      switch (job.channel) {
        case 'inapp':
          await this.deliverInApp(job.notificationId);
          break;
        case 'webhook':
          await this.deliverWebhook(job.notificationId, job.payload);
          break;
        case 'email':
          await this.deliverEmail(job.notificationId, job.payload);
          break;
      }
      db.prepare('UPDATE notifications SET delivery_status=? WHERE id=?').run('delivered', job.notificationId);
    } catch (err) {
      if (job.attempt < 3) {
        // Exponential backoff: 1s, 4s, 16s
        const delayMs = Math.pow(4, job.attempt - 1) * 1000;
        setTimeout(() => {
          this.queue.push(job);
          this.processQueue();
        }, delayMs);
      } else {
        db.prepare('UPDATE notifications SET delivery_status=? WHERE id=?').run('failed', job.notificationId);
        this.emit('failed', { notificationId: job.notificationId, error: (err as Error).message });
      }
    }
  }

  private async deliverInApp(_notificationId: string): Promise<void> {
    // In-app delivery is immediate (notification row already created)
    return Promise.resolve();
  }

  private async deliverWebhook(notificationId: string, payload: Record<string, unknown>): Promise<void> {
    const settingsRow = db.prepare("SELECT value FROM settings WHERE key='webhookUrl'").get() as { value: string } | undefined;
    const url = settingsRow?.value;
    if (!url) throw new Error('webhookUrl not configured');

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId, ...payload }),
    });

    if (!res.ok) throw new Error(`webhook returned ${res.status}`);
  }

  private async deliverEmail(_notificationId: string, payload: Record<string, unknown>): Promise<void> {
    const settingsRow = db.prepare("SELECT value FROM settings WHERE key='smtpHost'").get() as { value: string } | undefined;
    if (!settingsRow?.value) throw new Error('SMTP not configured');

    // Email delivery requires nodemailer; stub for now
    console.log('[email-dispatch]', payload);
    return Promise.resolve();
  }

  // Mark notification as read
  markRead(notificationId: string): void {
    db.prepare('UPDATE notifications SET read_at=? WHERE id=?').run(new Date().toISOString(), notificationId);
  }

  // Get unread count for a user
  getUnreadCount(userId?: string): number {
    const sql = userId
      ? 'SELECT COUNT(*) as c FROM notifications WHERE user_id=? AND read_at IS NULL'
      : 'SELECT COUNT(*) as c FROM notifications WHERE read_at IS NULL';
    const row = db.prepare(sql).get(userId) as { c: number } | undefined;
    return row?.c ?? 0;
  }

  // Get notifications list
  getNotifications(userId?: string, limit = 20): Notification[] {
    const sql = userId
      ? 'SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT ?'
      : 'SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?';
    const rows = db.prepare(sql).all(...(userId ? [userId, limit] : [limit])) as Array<Record<string, unknown>>;
    return rows.map(r => ({
      id: r.id as string,
      userId: (r.user_id as string | null) ?? null,
      type: r.type as string,
      payload: JSON.parse((r.payload as string) ?? '{}'),
      channel: (r.channel as NotificationChannel) ?? 'inapp',
      readAt: (r.read_at as string | null) ?? null,
      createdAt: r.created_at as string,
      deliveryStatus: (r.delivery_status as NotificationDeliveryStatus) ?? 'pending',
    }));
  }
}

export const notificationDispatcher = new NotificationDispatcher();
