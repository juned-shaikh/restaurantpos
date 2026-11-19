import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { RealtimeSyncService } from './core/services/realtime-sync.service';
import { SecurityService, SecurityApprovalRequest } from './core/services/security.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'Restaurant & Cafe POS ERP SaaS';
  isAuthPage = false;

  approvalRequest: SecurityApprovalRequest | null = null;
  enteredPin: string = '';
  pinError: string = '';

  constructor(
    private realtimeSync: RealtimeSyncService,
    private router: Router,
    public securityService: SecurityService
  ) {}

  ngOnInit(): void {
    this.realtimeSync.initRealtimeListeners();

    const isStandaloneRoute = (url: string) => {
      return url.includes('/login') || url.includes('/qr-order') || url.includes('/customer-display');
    };

    this.isAuthPage = isStandaloneRoute(window.location.pathname);

    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.isAuthPage = isStandaloneRoute(event.urlAfterRedirects || event.url);
    });

    this.securityService.activeApprovalRequest$.subscribe(req => {
      this.approvalRequest = req;
      this.enteredPin = '';
      this.pinError = '';
    });
  }

  appendPin(digit: string): void {
    if (this.enteredPin.length < 6) {
      this.enteredPin += digit;
      this.pinError = '';
    }
  }

  backspacePin(): void {
    this.enteredPin = this.enteredPin.slice(0, -1);
    this.pinError = '';
  }

  submitPin(): void {
    if (!this.enteredPin) {
      this.pinError = 'Please enter 4-digit Manager PIN';
      return;
    }

    if (this.securityService.verifyPin(this.enteredPin)) {
      if (this.approvalRequest) {
        this.approvalRequest.resolve(true);
      }
      this.enteredPin = '';
      this.pinError = '';
    } else {
      this.pinError = '❌ Invalid PIN! Unauthorized attempt logged.';
      this.securityService.logAudit('FAILED_PIN_ATTEMPT', {
        actionRequested: this.approvalRequest?.action,
        attemptedAt: new Date().toISOString()
      });
      this.enteredPin = '';
    }
  }

  cancelPinApproval(): void {
    this.securityService.cancelApprovalRequest();
    this.enteredPin = '';
    this.pinError = '';
  }
}
