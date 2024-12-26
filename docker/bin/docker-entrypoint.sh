#!/bin/sh

set -e

# Take care about zombies
set -- tini -- "$@"

# user:group from host docker env.A 0:0 by default or result of -u UID:GID
SRC_UID=$(id -u)
SRC_GID=$(id -g)

# user:group of build in `node`` user
ORIGIN_NODE_UID=$(id -u node)
ORIGIN_NODE_GID=$(id -g node)


PUID=${PUID:-$ORIGIN_NODE_UID} # Use the environment variable value or default (1000) if variable is not set.
PGID=${PGID:-$ORIGIN_NODE_GID} # Use the environment variable value or default (1000) if variable is not set.


if [ "$PUID" != "$ORIGIN_NODE_UID" -o "$PGID" != "$ORIGIN_NODE_GID" ]; then

    printf "PUID and PGID envs were specified: %s:%s \n" "$PUID" "$PGID"
  
    if [ "$SRC_UID" = "0" ]; then
        # Adjusting node user
        groupmod -o -g "$PGID" node # Modify the group id.
        usermod -o -u "$PUID" node # Modify the user id.

        # fix data dirs permissions
        printf "Adjusting file permissions for the new node UID:GID...\n"
        # Changing $SRV_ROOT recursivelly takes too long. The same may be about $DATA_ROOT
        chown node:node $SRV_ROOT
        chown node:node $DATA_ROOT
        chown node:node $DATA_ROOT/*
        chown node:node -R $PM2_HOME
    else
        printf "WARNING: PUID/PGID envs were specified together with custom -u UID:GID argument.\n"
        printf "This may lead to unexpected problems with file permissions.\n"
    fi
fi


if [ "$SRC_UID" = "0" ]; then
    printf "Switching to node user (%s:%s)... \n" "$PUID" "$PGID"

    # Drop from root to node user 
    set -- gosu node:node "$@"
fi

printf "Command to be executed: 'exec %s'. Good luck.\n" "$*"

exec "$@"