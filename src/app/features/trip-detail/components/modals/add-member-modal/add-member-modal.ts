import { Component, Input, Output, EventEmitter, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../../../../core/i18n/translate.pipe';
import { TravelStore } from '../../../../../core/store/travel.store';
import { SupabaseService } from '../../../../../core/services/supabase.service';
import { ConfirmService } from '../../../../../core/services/confirm.service';
import { ToastService } from '../../../../../core/services/toast.service';
import { SwipeToCloseDirective } from '../../../../../shared/directives/swipe-to-close.directive';
import { Trip } from '../../../../../core/models/trip.model';
import { Member } from '../../../../../core/models/expense.model';

@Component({
  selector: 'app-add-member-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, SwipeToCloseDirective],
  templateUrl: './add-member-modal.html',
  styleUrl: './add-member-modal.scss'
})
export class AddMemberModalComponent {
  @Input({ required: true }) trip!: Trip;
  @Output() onClose = new EventEmitter<void>();

  private travelStore = inject(TravelStore);
  private supabaseService = inject(SupabaseService);
  private confirmService = inject(ConfirmService);
  private toastService = inject(ToastService);

  newMemberName = '';
  newMemberEmail = '';
  readonly inviteStatus = signal('');
  readonly inviteSuccess = signal(true);
  readonly isInviting = signal(false);

  closeAddMember() {
    this.onClose.emit();
  }

  private setInviteError(msg: string) {
    this.inviteSuccess.set(false);
    this.inviteStatus.set(msg);
  }

  async inviteMember() {
    const name = this.newMemberName.trim();
    let email = this.newMemberEmail.trim();

    if (!name) { this.setInviteError('Please enter the member\'s name.'); return; }
    if (email && !email.includes('@')) { this.setInviteError('Please enter a valid email address.'); return; }

    this.isInviting.set(true);
    this.inviteStatus.set('');
    this.travelStore.setGlobalLoading(true);

    const db = this.supabaseService.client;
    const trip = this.trip;

    try {
      let userId: string | null = null;
      let userAvatar: string | undefined = undefined;

      if (email) {
        // 1. Try to find user by email in `users` table
        const { data: userData } = await db.from('users').select('id, name, avatar_url').eq('email', email).maybeSingle();
        if (userData) {
          userId = userData['id'];
          if (userData['avatar_url']) userAvatar = userData['avatar_url'];
        }

        // 2. Try Edge Function
        if (!userId) {
          try {
            const { data: fnData, error: fnErr } = await db.functions.invoke('invite-member', { body: { email } });
            if (fnErr) throw fnErr;
            if (fnData?.userId) userId = fnData.userId;
          } catch (e: any) {
            console.warn('Invite edge function failed:', e);
            this.travelStore.setGlobalLoading(false); // temp hide loading for modal
            const confirmed = await this.confirmService.confirm(
              'Hệ thống gửi thư mời đang bị nghẽn! Thư mời bị chặn.<br><br>Bạn có muốn thêm người này dưới dạng <b>OFFLINE GUEST</b> (Chỉ có Tên, không có Email) để tính toán chia tiền trước không?',
              'Lỗi Gửi Email', 'Thêm Offline Guest', 'Huỷ bỏ'
            );
            this.travelStore.setGlobalLoading(true);
            
            if (confirmed) {
              email = ''; // Xoá email đi để app nhận diện chuẩn là GUEST
            } else {
              this.isInviting.set(false);
              this.travelStore.setGlobalLoading(false);
              return; // Huỷ ngang
            }
          }
        }
      }

      // 3. Build member object
      const finalId = userId || window.crypto.randomUUID();
      const alreadyMember = trip.members.some(m => m.id === finalId || (email && m.email === email));

      if (alreadyMember) {
        this.setInviteError('This person is already a member of the trip.');
        return;
      }

      const newMember: Member = {
        id: finalId,
        name,
        nickname: name,
        email: email || undefined,
        avatar: userAvatar,
        isMe: false
      };


      // Fetch latest members to prevent race condition
      const { data: freshTrip } = await db.from('trips').select('members').eq('id', trip.id).single();
      let dbMembers = trip.members;
      if (freshTrip && freshTrip.members) {
         let raw = freshTrip.members;
         if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { raw = []; } }
         if (Array.isArray(raw)) dbMembers = raw;
      }
      const updatedMembers = [...dbMembers, newMember];

      // 4. Update Supabase trip record
      const { error } = await db
        .from('trips')
        .update({ members: updatedMembers })
        .eq('id', trip.id);

      if (error) throw error;

      // 5. Update local store
      this.travelStore.updateTrip(trip.id, { members: updatedMembers });

      // Log action
      this.travelStore.insertActivityLog(
        trip.id,
        'INVITED_MEMBER',
        'MEMBER',
        finalId,
        newMember.name
      );

      // 6. Success
      this.inviteSuccess.set(true);
      this.inviteStatus.set(`✅ ${name} has been added to the trip!`);
      this.newMemberName = '';
      this.newMemberEmail = '';

      // Close after short delay
      setTimeout(() => {
        this.closeAddMember();
        this.inviteStatus.set('');
        this.travelStore.refreshData(); // Lấy lại list hiển thị
      }, 1500);
    } catch (err: any) {
      this.setInviteError(err.message || 'Failed to add member. Please try again.');
    } finally {
      this.isInviting.set(false);
      this.travelStore.setGlobalLoading(false);
    }
  }
}
