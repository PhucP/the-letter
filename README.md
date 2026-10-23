# Lá thư mùa hạ

Trải nghiệm web tương tác 2.5D trong lớp học Việt Nam, với mở thư, nhạc nền và trình chỉnh nội dung thư.

Mã nguồn HTML/CSS/JavaScript tĩnh, triển khai bằng GitHub Pages từ nhánh `main`, thư mục gốc.

## Chỉnh nội dung thư

Sau khi vén màn, nhấn đồng hồ 6 lần trong 6 giây. Trình chỉnh thư cho phép xuất một tệp HTML chứa nội dung mới. Để cập nhật website, thay tệp `index.html` trong repo bằng tệp HTML đã xuất.

Font Noto Sans được đóng gói trong `assets/fonts`, kèm giấy phép. Không cần build hoặc thư viện ngoài.

## Triển khai tự động

GitHub Pages lấy mã từ nhánh `main`, thư mục `/`, và dùng workflow `pages-build-deployment` do GitHub quản lý.

- Mỗi lần push commit lên `main`, GitHub tự build và deploy lại website.
- Merge pull request hoặc merge nhánh khác vào `main` cũng tạo push lên `main`, nên tự triển khai tương tự, gồm cả squash merge và rebase merge.
- Các nhánh khác và pull request chưa merge không cập nhật website công khai.

Theo dõi trạng thái tại [Actions](https://github.com/PhucP/the-letter/actions). Website: https://phucp.github.io/the-letter/.
