"""XML fixture samples for tests."""

SYNC_STATUS = b"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<SyncStatus name="Kitchen" modelName="NODE" brand="Bluesound" version="4.10.0" db="-42" volume="22" etag="1">
  <slave id="192.168.1.21"/>
  <group>Kitchen + Patio</group>
</SyncStatus>
"""

STATUS = b"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<status etag="2">
  <state>play</state>
  <volume>22</volume>
  <mute>0</mute>
  <service>Spotify</service>
  <title1>Song Title</title1>
  <artist>Artist Name</artist>
  <album>Album Name</album>
  <quality>320000</quality>
</status>
"""

# Synced secondary: SyncStatus has the real per-player volume; /Status mirrors group volume.
SYNC_STATUS_SLAVE = b"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<SyncStatus name="Kitchen Speakers" modelName="NODE 2i" brand="Bluesound" version="4.16.6" db="-8.7" volume="64" etag="252">
  <master port="11000">192.168.1.174</master>
</SyncStatus>
"""

STATUS_GROUP_VOLUME = b"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<status etag="g1">
  <state>stream</state>
  <volume>15</volume>
  <groupVolume>15</groupVolume>
  <mute>0</mute>
  <service>AirPlay</service>
  <title1>Track</title1>
</status>
"""

STATUS_TIDAL_CONNECT = b"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<status etag="t1">
  <state>stream</state>
  <volume>20</volume>
  <mute>0</mute>
  <service>TidalConnect</service>
  <serviceName>TIDAL connect</serviceName>
  <title1>Song</title1>
  <artist>Artist</artist>
</status>
"""

QUEUE = b"""<?xml version="1.0" encoding="UTF-8"?>
<playlist>
  <item>
    <title>Track A</title>
    <artist>Artist A</artist>
    <album>Album A</album>
    <service>Spotify</service>
  </item>
</playlist>
"""

PRESETS = b"""<?xml version="1.0" encoding="UTF-8"?>
<presets>
  <preset id="1">
    <name>Morning</name>
  </preset>
</presets>
"""

INPUTS = b"""<?xml version="1.0" encoding="UTF-8"?>
<inputs>
  <input selected="1">
    <name>Optical</name>
    <type>optical</type>
  </input>
</inputs>
"""
