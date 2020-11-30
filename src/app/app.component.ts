import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  title = 'monitor';
  hello = 'hello';
  pushHello = 'push';
  ecHello = '';
  showEC = false;
  // data$: Observable<any>;
  data: any;

  constructor(private httpClient: HttpClient) {}

  simpleClick() {}

  onClick() {
    setTimeout(() => {
      this.title = 'new title';
      // this.data$ = this.httpClient.get(
      //   'https://jsonplaceholder.typicode.com/users/1'
      // );
      this.httpClient
        .get('https://jsonplaceholder.typicode.com/users/1')
        .subscribe((data) => (this.data = data));
    });
  }

  push() {
    this.pushHello = 'updated';
  }

  parentClick() {
    console.log('parent clicked');
  }

  childClick() {
    console.log('child clicked');
  }
}
