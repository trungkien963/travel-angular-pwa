import { Injectable } from '@angular/core';
import { Trip } from '../../../core/models/trip.model';
import { Expense } from '../../../core/models/expense.model';
import { CATEGORY_META, Debt } from '../trip-detail.component';
import * as XLSX from 'xlsx';
import { formatDate, formatNumber } from '../../../core/utils/format.util';

@Injectable({
  providedIn: 'root'
})
export class TripExportService {

  exportExcel(
    trip: Trip | null, 
    tripExpenses: Expense[], 
    debtsList: Debt[], 
    totalTripCost: number
  ) {
    if (!trip) return;
    const members = trip.members;

    const wb = XLSX.utils.book_new();

    // Helper for safely getting share
    const getShare = (mId: string, e: Expense) => {
      if (e.splits && Object.keys(e.splits).filter(k => !k.startsWith('__')).length > 0) {
        return e.splits[mId] || 0;
      }
      return Math.round(e.amount / members.length);
    };

    // --- SHEET 1: SUMMARY ---
    const summaryData = [
      ['THÔNG TIN DỰ ÁN (TRIP SUMMARY)'],
      ['Tên chuyến đi', trip.title],
      ['Thời gian', `${formatDate(trip.startDate)} - ${formatDate(trip.endDate)}`],
      ['Tổng số thành viên', members.length],
      ['Tổng chi phí chuyến đi', totalTripCost],
      ['Tổng số hóa đơn', tripExpenses.length]
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    // --- SHEET 2: CHI_TIẾT CÁ NHÂN ---
    const chiTietData: any[] = [];
    chiTietData.push(['Tên người tham gia', 'Tên khoản chi', 'Ngày', 'Người thanh toán (Paid By)', 'Số tiền chịu (Share)']);
    members.forEach(m => {
      tripExpenses.forEach(e => {
         const share = getShare(m.id, e);
         if (share > 0) {
           chiTietData.push([m.name, e.desc, formatDate(e.date), this.getPayerName(trip, e.payerId), share]);
         }
      });
    });
    const wsChiTiet = XLSX.utils.aoa_to_sheet(chiTietData);
    XLSX.utils.book_append_sheet(wb, wsChiTiet, 'Chi Tiết Cá Nhân');

    // --- SHEET 3: DANH SÁCH HÓA ĐƠN ---
    const hoaDonData: any[] = [];
    hoaDonData.push(['Tên khoản chi', 'Ngày', 'Danh mục', 'Người thanh toán (Paid By)', 'Tổng tiền', 'Kiểu chia', 'Chi tiết chia định mức']);
    tripExpenses.forEach(e => {
      const participantsDetail: string[] = [];
      let isEven = true;
      
      members.forEach(m => {
        const share = getShare(m.id, e);
        if (share > 0) {
           participantsDetail.push(`${m.name} (${formatNumber(share)}đ)`);
        }
      });
      
      if (e.splits && Object.keys(e.splits).filter(k => !k.startsWith('__')).length > 0) {
         const amtValues = Object.values(e.splits).filter(v => typeof v === 'number' && v > 0);
         if (amtValues.length > 0) {
           const max = Math.max(...(amtValues as number[]));
           const min = Math.min(...(amtValues as number[]));
           if (max - min > 50) isEven = false;
         }
      }
      
      const splitType = isEven ? 'Chia đều' : 'Chia tùy chỉnh';
      hoaDonData.push([
        e.desc, 
        formatDate(e.date), 
        CATEGORY_META[e.category || 'OTHER']?.label || 'Other', 
        this.getPayerName(trip, e.payerId), 
        e.amount, 
        splitType, 
        participantsDetail.join('; ')
      ]);
    });
    const wsHoaDon = XLSX.utils.aoa_to_sheet(hoaDonData);
    XLSX.utils.book_append_sheet(wb, wsHoaDon, 'Danh Sách Hóa Đơn');

    // --- SHEET 4: TỔNG KẾT TÀI CHÍNH ---
    const overallData: any[] = [];
    overallData.push(['Tên người tham gia', 'Tổng đã chi (Paid)', 'Tổng thực tiêu (Share)', 'Thừa / Thiếu (Balance)', 'Chi tiết Thanh toán']);
    members.forEach(m => {
       const totalPaid = tripExpenses.filter(e => e.payerId === m.id).reduce((sum, e) => sum + e.amount, 0);
       const totalShare = tripExpenses.reduce((sum, e) => sum + getShare(m.id, e), 0);
       const balance = totalPaid - totalShare;
       
       const memberDebts = debtsList.filter(d => d.fromId === m.id);
       const memberCredits = debtsList.filter(d => d.toId === m.id);
       
       const debtStrings: string[] = [];
       memberDebts.forEach(d => debtStrings.push(`Thiếu trả cho ${d.toName}: ${formatNumber(d.amount)}đ`));
       memberCredits.forEach(c => debtStrings.push(`Nhận lại từ ${c.fromName}: ${formatNumber(c.amount)}đ`));
       if (debtStrings.length === 0 && balance === 0) debtStrings.push('Vừa vặn (Không nợ)');
       
       overallData.push([m.name, totalPaid, totalShare, balance, debtStrings.join(' | ')]);
    });
    const wsOverall = XLSX.utils.aoa_to_sheet(overallData);
    XLSX.utils.book_append_sheet(wb, wsOverall, 'Tổng Kết Tài Chính');

    // Download the file
    XLSX.writeFile(wb, `${trip.title}_Financial_Report.xlsx`);
  }

  private getPayerName(trip: Trip, payerId: string): string {
    return trip.members.find(m => m.id === payerId)?.name || 'Someone';
  }
}
