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
<playlist length="1">
  <song id="1">
    <title>Track A</title>
    <art>Artist A</art>
    <alb>Album A</alb>
    <service>Spotify</service>
  </song>
</playlist>
"""

PRESETS = b"""<?xml version="1.0" encoding="UTF-8"?>
<presets>
  <preset id="1">
    <name>Morning</name>
  </preset>
</presets>
"""

CAPTURE_SETTINGS = b"""<?xml version="1.0" encoding="UTF-8"?>
<settings>
  <menuGroup id="capture" displayName="Inputs"/>
  <menuGroup id="capture-input0" displayName="Analog Input" icon="/images/capture/ic_analoginput.png"/>
  <menuGroup id="capture-input1" displayName="Optical Input" icon="/images/capture/ic_opticalinput.png"/>
  <menuGroup id="capture-input2" displayName="HDMI ARC" icon="/images/capture/ic_tv.png"/>
  <setting id="bluetoothAutoplay" value="3"/>
</settings>
"""

STATUS_CAPTURE_OPTICAL = b"""<?xml version="1.0" encoding="UTF-8"?>
<status>
  <state>stream</state>
  <service>Capture</service>
  <title1>Optical Input</title1>
  <inputId>input1</inputId>
  <inputTypeIndex>spdif-1</inputTypeIndex>
  <streamUrl>Capture:spdif-input?id=input1</streamUrl>
  <volume>8</volume>
  <mute>0</mute>
</status>
"""
