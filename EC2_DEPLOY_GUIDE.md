# Hướng Dẫn Triển Khai TSViT Lên AWS EC2 Free Tier (t2.micro)

Tài liệu này hướng dẫn chi tiết cách deploy ứng dụng **TSViT Crop Classification** lên dịch vụ **AWS EC2 Free Tier** (miễn phí 750 giờ/tháng).

---

## 1. Khởi Tạo Máy Ảo EC2 (Miễn Phí Free Tier)

1. Đăng nhập vào [AWS Management Console](https://console.aws.amazon.com/ec2/).
2. Chọn **EC2** > Bấm nút **Launch instance**.
3. Cấu hình các thông số theo tiêu chuẩn **Free Tier**:
   - **Name**: `tsvit-cropmap`
   - **Application and OS Images (AMI)**: Chọn **Ubuntu Server 22.04 LTS (HVM)** *(Free tier eligible)*.
   - **Instance type**: Chọn **t2.micro** (1 vCPU, 1 GiB Memory) hoặc **t3.micro** *(Free tier eligible)*.
   - **Key pair (login)**: Chọn key pair có sẵn hoặc bấm **Create new key pair** (chọn định dạng `.pem`, ví dụ `tsvit-key.pem` và tải về máy tính).
   - **Network settings**:
     - ✅ Tích chọn **Allow SSH traffic from Anywhere (0.0.0.0/0)**
     - ✅ Tích chọn **Allow HTTP traffic from the internet (0.0.0.0/0)** *(Rất quan trọng để truy cập web cổng 80)*.
   - **Configure storage**: Đổi từ 8 GiB thành **20 GiB gp3** *(Free tier cho phép tối đa 30 GiB SSD)*.
4. Bấm **Launch instance** và đợi 1-2 phút cho instance chuyển sang trạng thái `Running`.
5. Copy địa chỉ **Public IPv4 address** của máy ảo (ví dụ: `54.210.123.45`).

---

## 2. Tải Mã Nguồn Lên Máy Ảo EC2

Mở terminal trên máy tính của bạn tại thư mục dự án (`Bai1`), chạy lệnh sau để đóng gói và gửi lên EC2:

```bash
# 1. Phân quyền cho file key pem (trên Linux/macOS)
chmod 400 tsvit-key.pem

# 2. Đóng gói mã nguồn (bỏ qua các thư mục tạm)
tar -czf app.tar.gz --exclude='.venv' --exclude='__pycache__' --exclude='.git' .

# 3. Chuyển file nén lên EC2 (thay 54.210.123.45 bằng IP thật của bạn)
scp -i tsvit-key.pem app.tar.gz ubuntu@54.210.123.45:~/

# 4. SSH vào máy ảo EC2 và giải nén
ssh -i tsvit-key.pem ubuntu@54.210.123.45 "mkdir -p ~/tsvit-app && tar -xzf ~/app.tar.gz -C ~/tsvit-app && rm ~/app.tar.gz"
```

---

## 3. Chạy Script Tự Động Cài Đặt và Khởi Chạy

SSH vào máy ảo EC2:
```bash
ssh -i tsvit-key.pem ubuntu@54.210.123.45
```

Di chuyển vào thư mục dự án và chạy script triển khai:
```bash
cd ~/tsvit-app
chmod +x deploy_ec2.sh
./deploy_ec2.sh
```

### Script `deploy_ec2.sh` sẽ tự động thực hiện:
1. **Thiết lập 2GB Swap Memory**: Khắc phục triệt để giới hạn 1GB RAM của `t2.micro`, chống tràn RAM khi load PyTorch model.
2. **Cài đặt PyTorch CPU tối ưu**: Sử dụng bản CPU siêu nhẹ, tiết kiệm ổ đĩa và hoạt động mượt mà trên EC2 Free Tier.
3. **Cấu hình Systemd Service**: Tự động chạy ứng dụng ở cổng **80** (HTTP tiêu chuẩn) và tự khởi động lại khi máy ảo reboot.

---

## 4. Truy Cập Ứng Dụng

Sau khi script hoàn tất, mở trình duyệt web và truy cập trực tiếp:
```text
http://<EC2-PUBLIC-IP>
```
*(Ví dụ: `http://54.210.123.45` - không cần gõ thêm số cổng `:8080`)*.

---

## 5. Quản Lý Service Trên EC2

- **Xem log realtime**:
  ```bash
  sudo journalctl -u tsvit-cropmap -f
  ```
- **Khởi động lại web app**:
  ```bash
  sudo systemctl restart tsvit-cropmap
  ```
- **Dừng web app**:
  ```bash
  sudo systemctl stop tsvit-cropmap
  ```
