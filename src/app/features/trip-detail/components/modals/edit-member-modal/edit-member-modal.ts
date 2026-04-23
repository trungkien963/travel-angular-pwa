import { Component, Input, Output, EventEmitter, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { TravelStore } from '../../../../../core/store/travel.store';
import { SupabaseService } from '../../../../../core/services/supabase.service';
import { ToastService } from '../../../../../core/services/toast.service';
import { SwipeToCloseDirective } from '../../../../../shared/directives/swipe-to-close.directive';
import { Trip } from '../../../../../core/models/trip.model';
import { Member } from '../../../../../core/models/expense.model';

@Component({
  selector: 'app-edit-member-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, SwipeToCloseDirective],
  templateUrl: './edit-member-modal.html',
  styleUrl: './edit-member-modal.css'
})
export class EditMemberModalComponent implements OnInit {
  @Input({ required: true }) member!: Member;
  @Input({ required: true }) trip!: Trip;
  @Output() onClose = new EventEmitter<void>();

  private travelStore = inject(TravelStore);
  private supabaseService = inject(SupabaseService);
  private toastService = inject(ToastService);

  editMemberName = '';
  editMemberEmail = '';
  readonly isSavingMember = signal(false);

  ngOnInit() {
    this.editMemberName = this.member.name || '';
    this.editMemberEmail = this.member.email || '';
  }

  closeEditMember() {
    this.onClose.emit();
  }

  async saveEditMember() {
    const name = this.editMemberName.trim();
    const email = this.editMemberEmail.trim();

    if (!name || !this.member) return;
    this.isSavingMember.set(true);
    this.travelStore.setGlobalLoading(true);

    const trip = this.trip;

    try {
      const db = this.supabaseService.client;
      
      // Merge Ghost User Migration Logic
      let newUserId = this.member.id;
      let newAvatar = this.member.avatar;
      
      if (email && email !== this.member.email) {
          const { data: userData } = await db.from('users').select('id, avatar_url').eq('email', email).maybeSingle();
          if (userData) {
             newUserId = userData['id'];
             if (userData['avatar_url']) newAvatar = userData['avatar_url'];
          } else {
             try {
                const { data: fnData, error: fnErr } = await db.functions.invoke('invite-member', { body: { email } });
                if (fnErr) throw fnErr;
                if (fnData?.userId) newUserId = fnData.userId;
             } catch (e: any) {
                console.warn('Re-invite fail:', e);
                this.toastService.show('Gửi thư nối tài khoản thất bại (Nghẽn mạng). Vui lòng thử lại sau 1 tiếng!', 'error');
                this.isSavingMember.set(false);
                this.travelStore.setGlobalLoading(false);
                return; // Huỷ không cho lưu thông tin mập mờ vào DB
             }
          }
          
          if (newUserId && newUserId !== this.member.id) {
             await db.rpc('merge_ghost_user', {
                p_trip_id: trip.id,
                p_ghost_id: this.member.id,
                p_real_user_id: newUserId,
                p_real_name: name,
                p_real_avatar: newAvatar,
                p_real_email: email
             });
             await this.travelStore.refreshData(); // Lấy data mới ngay lập tức
             this.toastService.show('Account merged successfully!', 'success');
             this.closeEditMember();
             return;
          }
      }

      // Fetch latest members to prevent race condition
      const { data: freshTrip } = await db.from('trips').select('members').eq('id', trip.id).single();
      let dbMembers = trip.members;
      if (freshTrip && freshTrip.members) {
         let raw = freshTrip.members;
         if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { raw = []; } }
         if (Array.isArray(raw)) dbMembers = raw;
      }

      const updatedMember: Member = { ...this.member, id: newUserId, name, nickname: name, email: email || undefined, avatar: newAvatar };
      const newMembers = dbMembers.map(m => m.id === this.member.id ? updatedMember : m);

      const { error } = await db.from('trips').update({ members: newMembers }).eq('id', trip.id);
      if (error) throw error;

      this.travelStore.updateTrip(trip.id, { members: newMembers });
      
      this.travelStore.insertActivityLog(
        trip.id,
        'UPDATED_MEMBER',
        'MEMBER',
        newUserId,
        name
      );

      this.closeEditMember();
    } catch (err: any) {
      this.toastService.show(err.message || 'Failed to update member.', 'error');
    } finally {
      this.isSavingMember.set(false);
      this.travelStore.setGlobalLoading(false);
    }
  }
}
