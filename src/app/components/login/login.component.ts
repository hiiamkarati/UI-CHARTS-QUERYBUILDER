import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent {
  constructor(private router: Router) {}

  login(username: string, password: string) {
    // Replace these hard-coded credentials with your own authentication logic
    if (username === 'admin' && password === 'pass') {
      sessionStorage.setItem('isLoggedIn', 'true');
      this.router.navigate(['/dashboard']);
    } else {
      alert('Invalid credentials! Please try again.');
    }
  }

  resetForm(username: HTMLInputElement, password: HTMLInputElement) {
    username.value = '';
    password.value = '';
  }
}
