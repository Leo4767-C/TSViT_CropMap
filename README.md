---
title: TSViT Crop Classification
emoji: 🌾
colorFrom: green
colorTo: emerald
sdk: gradio
app_file: app.py
pinned: false
---

# BÁO CÁO CẬP NHẬT: THAY THẾ SPATIAL ENCODER / BACKBONE CỦA TSViT BẰNG DINO-v3

Tài liệu này chỉ rõ từng vị trí code đã được cập nhật khi thay thế **Spatial Encoder / Backbone** của mô hình **TSViT** bằng kiến trúc **Meta DINO-v3**.

---

## 1. Xác Nhận Thay Đổi (Confirmation)

* **Encoder/Backbone được thay thế:** Toàn bộ phần **Spatial Transformer / Spatial Encoder** của TSViT (xử lý không gian các patch ảnh) đã được thay thế hoàn toàn bằng **DINO-v3**.
* **Đặc trưng mới từ DINO-v3:**
  1. **2D Axial Rotary Position Embedding (RoPE):** Thay thế việc cộng embedding vị trí tĩnh 1D bằng phép quay không gian 2D trên Query/Key trong Attention.
  2. **LayerScale:** Tham số co giãn kênh động giúp ổn định hội tụ cho các tầng sâu.
  3. **SwiGLU Gated-MLP:** Mạng nơ-ron dạng cổng Swish/SiLU của DINO-v3 có khả năng biểu diễn ngữ nghĩa vượt trội so với MLP thông thường.
* **Các model khác:** Đã được loại bỏ hoàn toàn khỏi repo, chỉ giữ lại duy nhất **TSViT**.

---

## 2. Chi Tiết Từng File & Vị Trí Đã Update

### 2.1. File mới: `models/TSViT/dinov3.py`
Toàn bộ mã nguồn kiến trúc DINO-v3 được đóng gói độc lập tại file này:
* **`class DINOv3RoPE(nn.Module)` (Dòng 8 - 77):** Tính ma trận xoay tần số góc 2D cho lưới patch $H_p \times W_p$, áp dụng trực tiếp lên Query và Key.
* **`class DINOv3LayerScale(nn.Module)` (Dòng 80 - 88):** Học tham số tỷ lệ kênh $\gamma$ (khởi tạo $10^{-5}$) trước residual add.
* **`class DINOv3GatedMLP(nn.Module)` (Dòng 91 - 103):** Mạng SwiGLU Gated Feed-Forward: $\text{down}(\text{silu}(\text{gate}(x)) \cdot \text{up}(x))$.
* **`class DINOv3Attention(nn.Module)` (Dòng 106 - 132):** Multi-head Attention tích hợp 2D RoPE.
* **`class DINOv3Block(nn.Module)` (Dòng 135 - 152):** Một khối Transformer DINO-v3 hoàn chỉnh (Norm -> Attn + RoPE -> LayerScale -> Norm -> SwiGLU -> LayerScale).
* **`class DINOv3SpatialEncoder(nn.Module)` (Dòng 155 - 204):** Bộ mã hóa không gian thay thế trực tiếp `space_transformer` trong TSViT.
* **`class DINOv3Backbone(nn.Module)` (Dòng 207 - 240):** Backbone 2D trích xuất đặc trưng ảnh vệ tinh từ số kênh bất kỳ.

---

### 2.2. File cập nhật: `models/TSViT/TSViTdense.py` (Mô hình phân đoạn ngữ nghĩa)

#### Chỗ 1: Import module DINO-v3 (Dòng 7)
```python
from models.TSViT.dinov3 import DINOv3SpatialEncoder
```

#### Chỗ 2: Khởi tạo Spatial Backbone trong `class TSViT` (Dòng 408 - 419)
* **Code cũ:**
  ```python
  self.space_pos_embedding = nn.Parameter(torch.randn(1, num_patches, self.dim))
  self.space_transformer = Transformer(self.dim, self.spatial_depth, self.heads, self.dim_head, self.dim * self.scale_dim, self.dropout)
  ```
* **Code mới sau khi thay DINO-v3:**
  ```python
  self.spatial_backbone = get_params_values(model_config, 'spatial_backbone', 'dinov3')
  if self.spatial_backbone in ['dinov3', 'dino-v3', 'DINOv3']:
      self.space_transformer = DINOv3SpatialEncoder(
          dim=self.dim, depth=self.spatial_depth, heads=self.heads, dim_head=self.dim_head,
          mlp_dim=self.dim * self.scale_dim, dropout=self.dropout, model_config=model_config)
  else:
      self.space_pos_embedding = nn.Parameter(torch.randn(1, num_patches, self.dim))
      self.space_transformer = Transformer(self.dim, self.spatial_depth, self.heads, self.dim_head, self.dim * self.scale_dim, self.dropout)
  ```

#### Chỗ 3: Lan truyền thuận (forward) trong `class TSViT` (Dòng 438 - 446)
* **Code cũ:**
  ```python
  x += self.space_pos_embedding
  x = self.dropout(x)
  x = self.space_transformer(x)
  ```
* **Code mới sau khi thay DINO-v3:**
  ```python
  if self.spatial_backbone in ['dinov3', 'dino-v3', 'DINOv3']:
      # 2D RoPE tự động mã hóa vị trí chính xác theo lưới patch (h, w)
      x = self.space_transformer(x, h=self.num_patches_1d, w=self.num_patches_1d)
  else:
      x += self.space_pos_embedding
      x = self.dropout(x)
      x = self.space_transformer(x)
  ```

#### Chỗ 4: Thêm class alias `TSViT_DINOv3` (Dòng 455 - 464)
```python
class TSViT_DINOv3(TSViT):
    """
    Temporal-Spatial ViT with DINO-v3 Spatial Encoder/Backbone.
    """
    def __init__(self, model_config):
        model_config = dict(model_config)
        model_config['spatial_backbone'] = 'dinov3'
        super().__init__(model_config)
```

---

### 2.3. File cập nhật: `models/TSViT/TSViTcls.py` (Mô hình phân loại đối tượng)
* **Import (Dòng 7 - 8):** Import `DINOv3SpatialEncoder`.
* **Khởi tạo `__init__` (Dòng 69 - 78):** Khởi tạo `self.space_transformer = DINOv3SpatialEncoder(...)`.
* **Hàm `forward` (Dòng 94 - 101):** Gọi `self.space_transformer(x, h=self.num_patches_1d, w=self.num_patches_1d, has_cls_token=True)[:, 0]`.
* **Thêm class alias (Dòng 106 - 114):** `class TSViTcls_DINOv3(TSViTcls)`.

---

### 2.4. File cập nhật: `models/__init__.py`
Tối giản toàn bộ file, chỉ giữ lại hàm khởi tạo cho TSViT:
```python
from models.TSViT.TSViTdense import TSViT, TSViT_DINOv3
from models.TSViT.TSViTcls import TSViTcls, TSViTcls_DINOv3

def get_model(config, device):
    model_config = config['MODEL']
    arch = model_config['architecture']

    if arch in ["TSViTcls", "TSViTcls_DINOv3", "TSViTcls-DINOv3"]:
        model_config['device'] = device
        return TSViTcls(model_config).to(device)

    elif arch in ["TSViT", "TSViT_DINOv3", "TSViT-DINOv3"]:
        return TSViT(model_config).to(device)
```

---

### 2.5. File cấu hình mẫu: `configs/PASTIS24/TSViT_DINOv3_fold1.yaml`
Được tạo mới hoàn chỉnh để chạy ngay:
```yaml
MODEL:
  architecture: "TSViT_DINOv3"
  spatial_backbone: "dinov3"
  img_res: 24
  patch_size: 2
  max_seq_len: 60
  num_channels: 11
  num_classes: 19
  dim: 128
  temporal_depth: 4
  spatial_depth: 4
  heads: 4
  dim_head: 32
  scale_dim: 4
```

---

## 3. Lệnh Chạy Huấn Luyện Thử Nghiệm

* **Semantic Segmentation (Phân đoạn):**
  ```bash
  python train_and_eval/segmentation_training_transf.py --config configs/PASTIS24/TSViT_DINOv3_fold1.yaml --device 0
  ```

* **Classification (Phân loại):**
  ```bash
  python train_and_eval/classification_train_transf.py --config configs/PASTIS24/TSViT_cls.yaml --device 0
  ```
