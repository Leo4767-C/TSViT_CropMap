# TSViT: Temporal-Spatial Vision Transformer for Multi-Temporal Satellite Crop Classification

An implementation of the **Temporal-Spatial Vision Transformer (TSViT)** for high-resolution, multi-temporal satellite crop classification on Sentinel-2 time series (PASTIS-24 and France agricultural benchmarks).

---

## 1. Architectural Overview

Agricultural crop phenology requires modeling both long-range seasonal temporal dynamics and localized spatial plot boundaries. TSViT decouples processing into a Temporal Transformer followed by a Spatial Transformer:

```
Input Satellite Tensor: (B, T, C=11, H=24, W=24)
              │
              ▼  Patch Partitioning (P=2x2)
         (B, T, N_p=144, D=128)
              │
              ▼  Temporal Transformer (Self-Attention across T dimension)
         (B, T, N_p=144, D=128)
              │
              ▼  Temporal Aggregation / Class Token Extraction
         (B, N_p=144, D=128)
              │
  ┌───────────┴─────────────────────────────────────────────┐
  │         Spatial Transformer Encoder                     │
  │  - Static Spatial Position Embedding                    │
  │  - Multi-Head Self-Attention across Patches (N_p=144)   │
  │  - Feed-Forward MLP with LayerNorm & Dropout            │
  └───────────┬─────────────────────────────────────────────┘
              │
              ▼  Linear Segmentation Head + Reshape
        Spatial Logits: (B, H=24, W=24, NumClasses=19)
              │
              ▼
  ┌─────────────────────────────────────────────────────────┐
  │       Masked Adaptive Optimization Objective            │
  │  L_total = lambda_CE * L_MCE + lambda_Dice * L_MDice   │
  └─────────────────────────────────────────────────────────┘
```

---

## 2. Core Architecture: Pure TSViT

1. **Temporal Attention**: Attends across time acquisitions $T$ for each patch independently, capturing crop phenological growth trajectories throughout the season.
2. **Spatial Attention**: Attends across spatial patches $N_p = (H/P) \times (W/P)$ to model parcel boundaries and spatial context.
3. **Decoupled Factorization**: By factorizing space and time, TSViT scales efficiently to long sequence lengths without the quadratic complexity of joint space-time self-attention.

---

## 3. Loss Function Formulations & Optimization Dynamics

Earth Observation datasets feature irregular parcel geometries, unannotated non-agricultural regions (void/clouds/roads), and heavy long-tailed class distributions. The loss suite in `metrics/loss_functions.py` supports masked execution and compound multi-objective balancing.

### 3.1. Masked Cross-Entropy Loss ($\mathcal{L}_{\text{MCE}}$)
Vanilla Cross-Entropy evaluates across all pixels indiscriminately. In agricultural remote sensing, ground truth masks $M \in \{0, 1\}^{B \times H \times W}$ specify valid parcel labels. $\mathcal{L}_{\text{MCE}}$ isolates valid pixels through vectorized tensor slicing:

$$\mathcal{L}_{\text{MCE}}(\mathbf{Z}, \mathbf{Y}, \mathbf{M}) = - \frac{1}{\sum_{i=1}^{N} m_i} \sum_{i=1}^{N} m_i \cdot \log \left( \frac{\exp(z_{i, y_i})}{\sum_{c=1}^{C} \exp(z_{i, c})} \right)$$

Where $N = B \cdot H \cdot W$, $z_{i, c}$ denotes the predicted logit for class $c$ at pixel $i$, and $y_i$ is the target class.

### 3.2. Masked Focal Loss ($\mathcal{L}_{\text{MFL}}$)
To prevent dominant vegetative classes from overwhelming gradient updates, Masked Focal Loss applies a dynamic modulating factor $(1 - p_t)^\gamma$:

$$\mathcal{L}_{\text{MFL}} = - \frac{1}{\sum_i m_i} \sum_{i=1}^{N} m_i \cdot \alpha_{y_i} (1 - p_{t, i})^\gamma \log(p_{t, i})$$

### 3.3. Multi-Class Masked Dice Loss ($\mathcal{L}_{\text{MDice}}$)
To optimize boundary alignment directly in accordance with Intersection-over-Union (mIoU) metrics, Masked Dice loss computes generalized soft spatial overlap over valid masked pixels:

$$\mathcal{L}_{\text{MDice}} = 1 - \frac{1}{C} \sum_{c=1}^{C} \frac{2 \sum_{i \in \mathcal{M}} p_{i, c} \cdot y_{i, c} + \epsilon}{\sum_{i \in \mathcal{M}} p_{i, c}^2 + \sum_{i \in \mathcal{M}} y_{i, c}^2 + \epsilon}$$

---

## 4. Codebase Architecture & File Mapping

| Module Path | Role in Architecture |
|---|---|
| [`models/TSViT/TSViTdense.py`](models/TSViT/TSViTdense.py) | **Dense Segmentation Model**: Temporal and Spatial Transformers for dense pixel-level crop mapping. |
| [`models/TSViT/TSViTcls.py`](models/TSViT/TSViTcls.py) | **Crop Classification Model**: Field-level classification with dedicated token preservation. |
| [`models/TSViT/module.py`](models/TSViT/module.py) | **Transformer Blocks**: Attention, PreNorm, FeedForward components. |
| [`metrics/loss_functions.py`](metrics/loss_functions.py) | **Optimization Loss Suite**: Implements `MaskedCrossEntropyLoss`, `MaskedFocalLoss`, `MaskedDiceLoss`. |
| [`models/__init__.py`](models/__init__.py) | **Factory Dispatcher**: Model instantiate routing for `TSViT` and `TSViTcls`. |
| [`configs/PASTIS24/TSViT_fold1.yaml`](configs/PASTIS24/TSViT_fold1.yaml) | **Experiment Configuration**: Full YAML recipe specifying hyperparameters and solver schedules. |
| [`webapp/server.py`](webapp/server.py) | **WebApp & API**: Interactive Sentinel-2 crop classification inference server. |

---

## 5. Experiment Setup & Training Workflow

### 5.1. Solver Configuration (`configs/PASTIS24/TSViT_fold1.yaml`)

```yaml
MODEL:
  architecture: "TSViT"
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

SOLVER:
  num_epochs: 100
  num_warmup_epochs: 10
  steps: (0, 80000)
  loss_function: masked_cross_entropy
  lr_scheduler: 'cosine'
  lr_base: 1.0e-3
  lr_min: 5.0e-6
  lr_start: 1.0e-8
  weight_decay: 0.0

CHECKPOINT:
  load_from_checkpoint: 'Checkpoint/checkpoint/best.pth'
  partial_restore: False
  save_path: 'models/saved_models/PASTIS24/TSViT_fold1'
```

### 5.2. Training & Evaluation Execution

To train TSViT on PASTIS-24:

```bash
# Multi-GPU Semantic Segmentation (PASTIS-24 benchmark)
python train_and_eval/segmentation_training_transf.py \
  --config configs/PASTIS24/TSViT_fold1.yaml \
  --device 0,1

# Single-GPU Field-Level Classification
python train_and_eval/classification_train_transf.py \
  --config configs/PASTIS24/TSViT_cls.yaml \
  --device 0
```

### 5.3. Running the Web Application

```bash
python run_app.py
# Or directly:
python app.py
```
