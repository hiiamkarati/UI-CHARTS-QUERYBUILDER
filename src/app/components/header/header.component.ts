import { Component, OnInit } from '@angular/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-header',
  imports: [MatSlideToggleModule, CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css',
  standalone: true,
})
export class HeaderComponent implements OnInit {
  username: string = 'admin'; // Default username
  showDropdown: boolean = false;

  constructor(private router: Router) {}

  ngOnInit() {
    // You could fetch the actual username from a service or session storage if needed
  }

  reload() {
    window.location.reload();
  }

  toggleDropdown() {
    this.showDropdown = !this.showDropdown;
  }

  logout() {
    sessionStorage.removeItem('isLoggedIn');
    this.router.navigate(['/login']);
  }

  openSettings() {
    // Close the dropdown menu
    this.showDropdown = false;
    // Navigate to the settings page
    this.router.navigate(['/settings']);
  }
}
