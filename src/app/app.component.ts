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
  // data$: Observable<any>;
  data: any;

  constructor(private httpClient: HttpClient) {}

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
}
