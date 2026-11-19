import { Component, OnInit, OnDestroy } from '@angular/core';
import { KdsService } from '../../core/services/kds.service';
import { KotTicket, KitchenStation, KdsPerformanceMetric } from '../../core/models/kds.model';
import { PrintService } from '../../core/services/print.service';

@Component({
  selector: 'app-kds',
  templateUrl: './kds.component.html',
  styleUrls: ['./kds.component.scss']
})
export class KdsComponent implements OnInit, OnDestroy {
  stations: KitchenStation[] = [];
  tickets: KotTicket[] = [];
  selectedStationId: string = 'ALL';
  showMetricsModal = false;
  metrics: KdsPerformanceMetric[] = [];
  timerInterval: ReturnType<typeof setInterval> | null = null;

  // Reject Modal State
  showRejectModal = false;
  ticketToReject: KotTicket | null = null;
  rejectReason = 'Ingredient Out of Stock';
  managerPin = '';

  rejectReasonOptions = [
    { label: 'Ingredient Out of Stock', value: 'Ingredient Out of Stock', icon: 'ri-close-circle-line' },
    { label: 'Guest Cancelled / Left', value: 'Guest Cancelled / Left', icon: 'ri-user-unfollow-line' },
    { label: 'Kitchen Overloaded', value: 'Kitchen Overloaded', icon: 'ri-fire-line' },
    { label: 'Wrong Dish Ordered', value: 'Wrong Dish Ordered', icon: 'ri-error-warning-line' }
  ];

  constructor(
    public kdsService: KdsService,
    public printService: PrintService
  ) {}

  ngOnInit(): void {
    this.kdsService.stations$.subscribe(s => this.stations = s);
    this.kdsService.tickets$.subscribe(t => {
      this.tickets = t;
      this.recalculateElapsedMinutes();
    });

    this.metrics = this.kdsService.getStationPerformanceMetrics();

    // Live countdown timer update every 15 seconds
    this.timerInterval = setInterval(() => {
      this.recalculateElapsedMinutes();
    }, 15000);
  }

  ngOnDestroy(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  recalculateElapsedMinutes(): void {
    const now = Date.now();
    this.tickets.forEach(ticket => {
      const created = new Date(ticket.created_at).getTime();
      ticket.elapsed_mins = Math.floor((now - created) / 60000);
    });
  }

  get filteredTickets(): KotTicket[] {
    if (this.selectedStationId === 'ALL') {
      return this.tickets;
    }
    return this.tickets.filter(t => t.kitchen_station_id === this.selectedStationId);
  }

  get pendingTickets(): KotTicket[] {
    return this.filteredTickets.filter(t => t.status === 'PENDING');
  }

  get preparingTickets(): KotTicket[] {
    return this.filteredTickets.filter(t => t.status === 'PREPARING');
  }

  get readyTickets(): KotTicket[] {
    return this.filteredTickets.filter(t => t.status === 'READY');
  }

  toggleStrike(ticketId: string, itemId: string): void {
    this.kdsService.toggleItemStrikeThrough(ticketId, itemId);
  }

  // Strict step-by-step state machine: PENDING -> PREPARING -> READY -> SERVED
  advanceTicket(ticketOrId: KotTicket | string): void {
    const id = typeof ticketOrId === 'string' ? ticketOrId : ticketOrId.id;
    this.kdsService.advanceTicketStatus(id);
  }

  bumpTicket(ticketId: string): void {
    this.kdsService.bumpTicket(ticketId);
  }

  // Reprint stamped with *** REPRINT ***
  reprintKot(ticket: KotTicket): void {
    this.printService.printKotTicket(ticket, true);
  }

  printTicket(ticket: KotTicket): void {
    this.reprintKot(ticket);
  }

  // Reject Ticket workflow (Requires Manager PIN if food is already being cooked)
  openRejectModal(ticket: KotTicket): void {
    this.ticketToReject = ticket;
    this.rejectReason = 'Ingredient Out of Stock';
    this.managerPin = '';
    this.showRejectModal = true;
  }

  confirmRejectTicket(): void {
    if (!this.ticketToReject) return;

    // If food already being cooked, manager confirmation is required
    if (this.ticketToReject.status === 'PREPARING') {
      if (this.managerPin !== '1234') {
        alert('Food is already being cooked! Valid Manager PIN (default: 1234) is required to reject.');
        return;
      }
    }

    const rejectionLog = {
      ticketNumber: this.ticketToReject.kot_number,
      reason: this.rejectReason,
      rejectedBy: this.ticketToReject.status === 'PREPARING' ? 'Manager (PIN verified)' : 'Kitchen Chef',
      rejectedAt: new Date().toLocaleTimeString()
    };

    alert(`Ticket #${this.ticketToReject.kot_number} rejected.\nReason: ${rejectionLog.reason}\nLogged at: ${rejectionLog.rejectedAt}`);

    // Remove from active queue
    this.kdsService.bumpTicket(this.ticketToReject.id);
    this.showRejectModal = false;
    this.ticketToReject = null;
  }

  isUrgent(t: KotTicket): boolean {
    return (t.elapsed_mins || 0) > 15;
  }

  getTimerClass(t: KotTicket): string {
    const m = t.elapsed_mins || 0;
    if (m < 10) return 'green';
    if (m < 20) return 'amber';
    return 'red';
  }
}
