import { Module } from '@nestjs/common';
import { KivaModule } from './kiva/kiva.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MessagesModule } from './messages/messages.module';
import { EventsModule } from './events/events.module';
import { PostsModule } from './posts/posts.module';
import { ChannelsModule } from './channels/channels.module';
import { CommunitiesModule } from './communities/communities.module';

@Module({
  imports: [
    KivaModule,
    AuthModule,
    UsersModule,
    MessagesModule,
    EventsModule,
    PostsModule,
    ChannelsModule,
    CommunitiesModule,
  ],
})
export class AppModule {}
