declare module 'express-mysql-session' {
  import { Store } from 'express-session';

  interface MySQLStoreOptions {
    host?:                    string;
    port?:                    number;
    user?:                    string;
    password?:                string;
    database?:                string;
    clearExpired?:            boolean;
    checkExpirationInterval?: number;
    expiration?:              number;
    createDatabaseTable?:     boolean;
    connectionLimit?:         number;
    endConnectionOnClose?:    boolean;
    disableTouch?:            boolean;
    charset?:                 string;
    schema?:                  object;
    [key: string]:            any;
  }

  function MySQLStoreFactory(session: any): new (options: MySQLStoreOptions, connection?: any) => Store;

  export = MySQLStoreFactory;
}
