import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Toast, ToastType } from '../models/toast.model';

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private toastsSubject = new BehaviorSubject<Toast[]>([]);
  toasts$: Observable<Toast[]> = this.toastsSubject.asObservable();

  show(message: string, type: ToastType = 'info', title?: string, durationMs: number = 4200): void {
    if (!message) return;
    const id = `toast-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newToast: Toast = { id, type, title, message, durationMs };

    // Keep max 5 toasts on screen
    const current = this.toastsSubject.value;
    this.toastsSubject.next([...current.slice(-4), newToast]);

    if (durationMs > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, durationMs);
    }
  }

  success(message: string, title: string = 'Success', durationMs: number = 4000): void {
    this.show(message, 'success', title, durationMs);
  }

  error(message: string, title: string = 'Notice', durationMs: number = 5500): void {
    this.show(message, 'error', title, durationMs);
  }

  warning(message: string, title: string = 'Warning', durationMs: number = 4500): void {
    this.show(message, 'warning', title, durationMs);
  }

  info(message: string, title: string = 'Information', durationMs: number = 3800): void {
    this.show(message, 'info', title, durationMs);
  }

  dismiss(id: string): void {
    const updated = this.toastsSubject.value.filter(t => t.id !== id);
    this.toastsSubject.next(updated);
  }

  clearAll(): void {
    this.toastsSubject.next([]);
  }
}
