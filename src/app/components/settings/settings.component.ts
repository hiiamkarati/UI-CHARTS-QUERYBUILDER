import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, MatSlideToggleModule],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css'],
})
export class SettingsComponent implements OnInit {
  darkMode: boolean = false;
  notifications: boolean = true;
  language: string = 'English';
  languages: string[] = ['English', 'Spanish', 'French', 'German'];

  constructor() {}

  ngOnInit(): void {
    // You might want to load saved settings from a service here
  }

  saveSettings(): void {
    // Here you would implement saving the settings
    console.log('Settings saved:', {
      darkMode: this.darkMode,
      notifications: this.notifications,
      language: this.language,
    });
    // Show success message
    alert('Settings saved successfully!');
  }

  closeSettings(): void {
    // Here you would implement closing the settings dialog or navigation
    history.back(); // Simple navigation back
  }
}
