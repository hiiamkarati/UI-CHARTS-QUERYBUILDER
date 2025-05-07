import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
 
interface UserProfile {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phone: string;
  address: string;
}
 
@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css'],
})
export class ProfileComponent implements OnInit {
  userProfile: UserProfile = {
    firstName: 'Meet ',
    lastName: 'Ponkiya',
    username: 'Meet47P',
    email: 'Meet.Technovate.In',
    phone: '+91 8320442877',
    address: 'House',
  };
 
  // Create a copy for editing
  editedProfile: UserProfile = { ...this.userProfile };
 
  isEditing = false;
 
  constructor(private router: Router) {}
 
  ngOnInit(): void {
    // In a real app, you would fetch user data from a service
    this.loadUserProfile();
  }
 
  loadUserProfile(): void {
    // Simulating data fetch from server
    console.log('Loading user profile data...');
    // In a real application, this would be a service call
  }
 
  toggleEdit(): void {
    this.isEditing = true;
    // Create a fresh copy of the user profile for editing
    this.editedProfile = { ...this.userProfile };
  }
 
  saveProfile(): void {
    // In a real app, you would send this data to a server
    this.userProfile = { ...this.editedProfile };
    this.isEditing = false;
 
    // Show success notification
    // This would be a proper notification in a real app
    console.log('Profile updated successfully!');
    alert('Profile updated successfully!');
  }
 
  cancelEdit(): void {
    this.isEditing = false;
    // No need to do anything with editedProfile as we'll create a fresh copy next time
  }
 
  goBack(): void {
    this.router.navigate(['/dashboard']);
  }
}