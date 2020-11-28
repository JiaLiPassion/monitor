import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';
import { initMonitorZone } from './monitor';

if (environment.production) {
  enableProdMode();
}

initMonitorZone(
  () => platformBrowserDynamic().bootstrapModule(AppModule),
  document.querySelector('app-root')
);
// platformBrowserDynamic().bootstrapModule(AppModule);
