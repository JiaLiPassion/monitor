import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';

import { AppComponent } from './app.component';
import { HelloComponent } from './hello/hello.component';
import { OnpushComponent } from './onpush/onpush.component';
import { EcComponent } from './ec/ec.component';

@NgModule({
  declarations: [AppComponent, HelloComponent, OnpushComponent, EcComponent],
  imports: [BrowserModule, HttpClientModule],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}
