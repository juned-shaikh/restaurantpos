import {
  Component,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  HostListener,
  forwardRef
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface SelectOption {
  label: string;
  value: any;
  icon?: string;
  subtext?: string;
  badge?: string;
  badgeType?: string;
}

@Component({
  selector: 'app-custom-select',
  templateUrl: './custom-select.component.html',
  styleUrls: ['./custom-select.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomSelectComponent),
      multi: true
    }
  ]
})
export class CustomSelectComponent implements ControlValueAccessor {
  @Input() options: (SelectOption | string)[] = [];
  @Input() placeholder: string = 'Select option';
  @Input() disabled: boolean = false;
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  @Input() icon: string = '';
  @Input() menuAlign: 'left' | 'right' = 'left';
  @Input() menuWidth?: string;
  @Input() menuMinWidth?: string;

  @Output() valueChange = new EventEmitter<any>();
  @Output() change = new EventEmitter<any>();

  selectedValue: any = null;
  isOpen: boolean = false;
  openUpwards: boolean = false;
  searchFilter: string = '';

  private onChange: (val: any) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private elementRef: ElementRef) {}

  get normalizedOptions(): SelectOption[] {
    if (!this.options) return [];
    return this.options.map(opt => {
      if (typeof opt === 'string') {
        return { label: opt, value: opt };
      }
      return opt;
    });
  }

  get filteredOptions(): SelectOption[] {
    const opts = this.normalizedOptions;
    if (!this.searchFilter?.trim()) return opts;
    const q = this.searchFilter.toLowerCase().trim();
    return opts.filter(o =>
      o.label.toLowerCase().includes(q) ||
      (o.subtext && o.subtext.toLowerCase().includes(q))
    );
  }

  get selectedOption(): SelectOption | undefined {
    return this.normalizedOptions.find(opt => opt.value === this.selectedValue);
  }

  get displayLabel(): string {
    const opt = this.selectedOption;
    return opt ? opt.label : this.placeholder;
  }

  get displayIcon(): string | undefined {
    return this.selectedOption?.icon || this.icon;
  }

  toggleDropdown(event?: Event): void {
    if (event) event.stopPropagation();
    if (this.disabled) return;

    if (this.isOpen) {
      this.isOpen = false;
      this.searchFilter = '';
    } else {
      this.isOpen = true;
      this.searchFilter = '';
      this.checkPosition();
      this.onTouched();
    }
  }

  private checkPosition(): void {
    try {
      const rect = this.elementRef.nativeElement.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      // If less than 240px below and enough space above, flip upwards
      this.openUpwards = spaceBelow < 240 && rect.top > 240;

      // Guard against right screen edge overflow on mobile / narrow screens
      const screenWidth = window.innerWidth;
      if (rect.left + 240 > screenWidth) {
        this.menuAlign = 'right';
      }
    } catch {
      this.openUpwards = false;
    }
  }

  selectOption(opt: SelectOption, event?: Event): void {
    if (event) event.stopPropagation();
    if (this.disabled) return;
    this.selectedValue = opt.value;
    this.isOpen = false;
    this.searchFilter = '';
    this.onChange(this.selectedValue);
    this.valueChange.emit(this.selectedValue);
    this.change.emit(this.selectedValue);
  }

  // Close when clicking outside of the component
  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isOpen = false;
      this.searchFilter = '';
    }
  }

  // Keyboard navigation
  @HostListener('keydown.escape')
  onEscape(): void {
    this.isOpen = false;
  }

  // ControlValueAccessor methods
  writeValue(val: any): void {
    this.selectedValue = val;
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState?(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
}
