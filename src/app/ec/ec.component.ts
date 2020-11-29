import {
  AfterViewChecked,
  AfterViewInit,
  Component,
  Input,
  OnInit,
} from '@angular/core';

@Component({
  selector: 'app-ec',
  templateUrl: './ec.component.html',
  styleUrls: ['./ec.component.scss'],
})
export class EcComponent implements OnInit, AfterViewChecked {
  @Input() hello: string;

  constructor() {
    console.log('ec constructor');
  }

  ngOnInit(): void {}

  ngAfterViewChecked() {
    if (this.hello) {
      this.hello = this.hello + 'updated ecHello';
    }
  }
}
