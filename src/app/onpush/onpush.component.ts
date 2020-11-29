import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnInit,
} from '@angular/core';

@Component({
  selector: 'app-onpush',
  templateUrl: './onpush.component.html',
  styleUrls: ['./onpush.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnpushComponent implements OnInit {
  @Input() hello: string;

  constructor() {}

  ngOnInit(): void {}
}
