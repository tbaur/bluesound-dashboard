"""Sync graph helpers."""

from __future__ import annotations

from app.models import PlayerStatus, SyncGroup, SyncRole, SyncState


def build_sync_state(devices: list[PlayerStatus]) -> SyncState:
    by_ip = {d.ip: d for d in devices}
    groups: list[SyncGroup] = []
    in_group: set[str] = set()

    for device in devices:
        if device.sync_role != SyncRole.PRIMARY and not device.slaves:
            continue
        slave_ids: list[str] = []
        slave_names: list[str] = []
        for slave_ip in device.slaves:
            slave = by_ip.get(slave_ip)
            if slave:
                slave_ids.append(slave.id)
                slave_names.append(slave.name)
                in_group.add(slave.id)
        in_group.add(device.id)
        groups.append(
            SyncGroup(
                primary_id=device.id,
                primary_name=device.name,
                primary_ip=device.ip,
                group=device.group,
                slave_ids=slave_ids,
                slave_names=slave_names,
            )
        )

    standalone = [d.id for d in devices if d.id not in in_group]
    return SyncState(groups=groups, standalone_ids=standalone)
