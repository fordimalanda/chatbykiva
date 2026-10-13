import { Module } from '@nestjs/common';
import { KivaModule } from './kiva/kiva.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MessagesModule } from './messages/messages.module';
import { EventsModule } from './events/events.module';
import { PostsModule } from './posts/posts.module';

@Module({
  imports: [
    KivaModule,
    AuthModule,
    UsersModule,
    MessagesModule,
    EventsModule,
    PostsModule,
  ],
})
export class AppModule {}
