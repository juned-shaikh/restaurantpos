import { Component } from '@angular/core';
import { ToastService } from '../../../core/services/toast.service';
import { Toast } from '../../../core/models/toast.model';

@Component({
  selector: 'app-toast',
  templateUrl: './toast.component.html',
  styleUrls: ['./toast.component.scss']
})
export class ToastComponent {
  constructor(public toastService: ToastService) {}

  getIcon(type: string): string {
    switch (type) {
      case 'success': return 'ri-checkbox-circle-fill';
      case 'error': return 'ri-error-warning-fill';
      case 'warning': return 'ri-alert-fill';
      default: return 'ri-information-fill';
    }
  }

  dismiss(toast: Toast): void {
    this.toastService.dismiss(toast.id);
  }
}
