from models.TSViT.TSViTdense import TSViT
from models.TSViT.TSViTcls import TSViTcls


def get_model(config, device):
    model_config = config['MODEL']
    arch = model_config['architecture']

    if arch in ["TSViTcls"]:
        model_config['device'] = device
        return TSViTcls(model_config).to(device)

    elif arch in ["TSViT"]:
        return TSViT(model_config).to(device)

    else:
        raise NameError(
            f"Model architecture '{arch}' not recognized. "
            f"Available architectures: 'TSViT', 'TSViTcls'"
        )
